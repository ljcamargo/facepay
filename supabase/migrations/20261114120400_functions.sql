-- Functions, triggers and the one view the app reads.
-- Every SECURITY DEFINER function pins search_path and is revoked in the RLS migration.

-- ── timestamps ──────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger legal_documents_updated_at before update on public.legal_documents
  for each row execute function public.set_updated_at();

-- ── caller context ──────────────────────────────────────────────────────────

-- Store of the calling kiosk. SECURITY DEFINER to avoid RLS recursion on devices.
create or replace function public.current_device_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id
  from public.devices
  where auth_uid = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_store_staff(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and store_id = p_store
  );
$$;

-- ── customer provisioning ───────────────────────────────────────────────────

-- Anonymous sign-in on the customer's phone creates the profile row.
-- Staff (email/password) users do not get one.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider' = 'anonymous' then
    insert into public.customers (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── face matching ───────────────────────────────────────────────────────────

-- Top-1/top-2 over active templates. Never guesses: returns `ambiguous` when the
-- margin is too small. The kiosk only ever sees a masked candidate.
create or replace function public.identify_customer(
  p_embedding  extensions.vector,
  p_model      text,
  p_min_sim    real default 0.60,
  p_min_margin real default 0.08,
  p_store_id   uuid default null
)
returns table (
  decision     public.match_decision,
  customer_id  uuid,
  display_name text,
  phone_masked text,
  similarity   real,
  margin       real
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_customer uuid;
  v_sim      real;
  v_margin   real;
begin
  if p_embedding is null then
    return query select 'model_error'::public.match_decision, null::uuid, null::text, null::text,
                        0::real, 0::real;
    return;
  end if;

  with scored as (
    select distinct on (ft.customer_id)
           ft.customer_id,
           1 - (ft.embedding <=> p_embedding) as sim
    from public.face_templates ft
    join public.customers c on c.id = ft.customer_id and c.status = 'active'
    where ft.revoked_at is null
      and ft.model = p_model
      and (ft.scope = 'global' or ft.store_id = p_store_id)
      and (ft.expires_at is null or ft.expires_at > now())
    order by ft.customer_id, ft.embedding <=> p_embedding
  ), ranked as (
    select customer_id, sim,
           sim - coalesce(lead(sim) over (order by sim desc), 0) as margin
    from scored
  )
  select customer_id, sim, margin
    into v_customer, v_sim, v_margin
  from ranked
  order by sim desc
  limit 1;

  v_sim := coalesce(v_sim, 0);
  v_margin := coalesce(v_margin, 0);

  if v_customer is null or v_sim < p_min_sim then
    return query select 'no_match'::public.match_decision, null::uuid, null::text, null::text,
                        v_sim, v_margin;
  elsif v_margin < p_min_margin then
    return query select 'ambiguous'::public.match_decision, null::uuid, null::text, null::text,
                        v_sim, v_margin;
  else
    return query
      select 'matched'::public.match_decision, c.id, c.display_name,
             '•••• ' || right(c.phone_e164, 4), v_sim, v_margin
      from public.customers c
      where c.id = v_customer;
  end if;
end;
$$;

-- Metadata-only view for the owner ("Mi cuenta"). The WHERE clause IS the guard:
-- do not remove it, and do not add `embedding` to the select list.
create view public.face_templates_public
with (security_invoker = false) as
select id,
       customer_id,
       model,
       model_version,
       quality,
       liveness,
       scope,
       created_at,
       last_used_at,
       expires_at
from public.face_templates
where revoked_at is null
  and customer_id = auth.uid();

comment on view public.face_templates_public is
  'Owner-visible template metadata. The customer_id filter is the security boundary.';

-- ── rate limiting ───────────────────────────────────────────────────────────

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;
