-- Fix: plpgsql resolved `customer_id` to the OUT parameter instead of the CTE
-- column, raising 42702 (ambiguous) on the first call. Columns now win.
-- Kept as a forward migration because 120400 is already applied.

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
#variable_conflict use_column
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
    select s.customer_id, s.sim,
           s.sim - coalesce(lead(s.sim) over (order by s.sim desc), 0) as margin
    from scored s
  )
  select r.customer_id, r.sim, r.margin
    into v_customer, v_sim, v_margin
  from ranked r
  order by r.sim desc
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

revoke execute on function public.identify_customer(extensions.vector, text, real, real, uuid)
  from public, anon;
grant execute on function public.identify_customer(extensions.vector, text, real, real, uuid)
  to authenticated;
