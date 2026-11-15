-- Phase A: the kiosk talks to Postgres for real.
-- A vendor signs in with email+password (Supabase Auth) and gets a staff row.
-- Every write below is SECURITY DEFINER + explicit store/ownership checks; the
-- client still has no INSERT/UPDATE grants on transactions or face_templates.

create or replace function public.current_staff_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.staff where user_id = auth.uid() limit 1;
$$;

-- ── checkout ────────────────────────────────────────────────────────────────
create or replace function public.create_checkout(
  p_amount_cents integer,
  p_concept text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store  uuid := public.current_staff_store_id();
  v_name   text;
  v_limit  integer;
  v_tx     public.transactions;
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  select name, pilot_limit_cents into v_name, v_limit
  from public.stores where id = v_store;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_amount_cents > v_limit then
    raise exception 'pilot limit exceeded' using errcode = '22023';
  end if;

  insert into public.transactions (store_id, amount_cents, concept, status)
  values (v_store, p_amount_cents, coalesce(nullif(btrim(p_concept), ''), v_name), 'created')
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ── after the face match is accepted ────────────────────────────────────────
create or replace function public.confirm_face_payment(
  p_tx uuid,
  p_customer uuid,
  p_similarity real default null,
  p_liveness real default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_staff_store_id();
  v_tx    public.transactions;
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions
  where id = p_tx and store_id = v_store
  for update;

  if v_tx.id is null then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if v_tx.status <> 'created' then
    raise exception 'transaction is not open' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.customers where id = p_customer and status = 'active') then
    raise exception 'customer not available' using errcode = '22023';
  end if;

  update public.transactions
     set customer_id = p_customer,
         method = 'face_pn',
         status = 'awaiting_payment',
         match_similarity = p_similarity,
         liveness = p_liveness,
         expires_at = now() + interval '10 minutes'
   where id = p_tx
   returning * into v_tx;

  return v_tx;
end;
$$;

-- ── Phase A only: stand-in for the CoDi webhook ─────────────────────────────
-- Deleted in Phase B, when the Edge Function + webhook take over.
create or replace function public.demo_mark_paid(p_tx uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_staff_store_id();
  v_tx    public.transactions;
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions
  where id = p_tx and store_id = v_store
  for update;

  if v_tx.id is null then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if v_tx.status = 'paid' then
    return v_tx;
  end if;

  update public.transactions
     set status = 'paid',
         paid_at = now(),
         payer_bank_code = 40012,
         payer_clabe_last4 = '8842',
         late_payment = v_tx.status = 'cancelled'
   where id = p_tx
   returning * into v_tx;

  return v_tx;
end;
$$;

create or replace function public.cancel_transaction(p_tx uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_staff_store_id();
  v_tx    public.transactions;
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  update public.transactions
     set status = 'cancelled'
   where id = p_tx and store_id = v_store and status <> 'paid'
   returning * into v_tx;

  return v_tx;
end;
$$;

-- ── customer enrollment ─────────────────────────────────────────────────────
-- The customer's own device inserts its template. Requires an accepted biometric
-- consent and at most 3 active templates. The vector arrives as text because
-- PostgREST has no vector type; the cast is validated by the column typmod.
create or replace function public.enroll_my_face(
  p_embedding text,
  p_model text,
  p_model_version text,
  p_quality real default null,
  p_liveness real default null,
  p_scope text default 'global'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id    uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.biometric_consents
    where customer_id = auth.uid()
      and doc_slug = 'biometric-consent'
      and accepted
      and revoked_at is null
  ) then
    raise exception 'consent required' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.face_templates
  where customer_id = auth.uid() and revoked_at is null;

  if v_count >= 3 then
    raise exception 'too many templates' using errcode = '22023';
  end if;

  insert into public.face_templates
    (customer_id, embedding, model, model_version, quality, liveness, source, scope)
  values
    (auth.uid(), p_embedding::extensions.vector(1024), p_model, p_model_version,
     p_quality, p_liveness, 'phone_selfie',
     case when p_scope = 'store' then 'store' else 'global' end)
  returning id into v_id;

  update public.customers set last_seen_at = now() where id = auth.uid();

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id, data)
  values ('customer', auth.uid(), 'face.enrolled', 'face_templates', v_id,
          jsonb_build_object('model', p_model, 'scope', coalesce(p_scope, 'global')));

  return v_id;
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.current_staff_store_id() from public, anon;
revoke execute on function public.create_checkout(integer, text) from public, anon;
revoke execute on function public.confirm_face_payment(uuid, uuid, real, real) from public, anon;
revoke execute on function public.demo_mark_paid(uuid) from public, anon;
revoke execute on function public.cancel_transaction(uuid) from public, anon;
revoke execute on function public.enroll_my_face(text, text, text, real, real, text) from public, anon;

grant execute on function public.current_staff_store_id() to authenticated;
grant execute on function public.create_checkout(integer, text) to authenticated;
grant execute on function public.confirm_face_payment(uuid, uuid, real, real) to authenticated;
grant execute on function public.demo_mark_paid(uuid) to authenticated;
grant execute on function public.cancel_transaction(uuid) to authenticated;
grant execute on function public.enroll_my_face(text, text, text, real, real, text) to authenticated;
