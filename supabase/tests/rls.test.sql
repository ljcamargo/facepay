-- RLS contract. Run with: bun run test:rls  (needs Docker + `supabase start`).
-- Every assertion is a promise made in docs/03-database.md §5.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

-- ── fixtures (as postgres: RLS bypassed) ────────────────────────────────────
insert into auth.users
  (id, instance_id, aud, role, is_anonymous, email, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', true, 'device-a@example.test',
   '{"provider":"anonymous"}', now(), now()),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', true, 'customer-a@example.test',
   '{"provider":"anonymous"}', now(), now()),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', true, 'customer-b@example.test',
   '{"provider":"anonymous"}', now(), now());

update public.customers set phone_e164 = '+525511112222', display_name = 'Ana'
  where id = '00000000-0000-4000-8000-00000000c001';
update public.customers set phone_e164 = '+525533334444', display_name = 'Beto'
  where id = '00000000-0000-4000-8000-00000000c002';

insert into public.stores (id, name) values
  ('00000000-0000-4000-8000-00000000a001', 'Store A'),
  ('00000000-0000-4000-8000-00000000b001', 'Store B');

insert into public.devices (id, store_id, auth_uid, status, label) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a001',
   '00000000-0000-4000-8000-00000000d001', 'active', 'Caja A');

insert into public.transactions
  (id, store_id, device_id, customer_id, amount_cents, concept, method, status, pey_transaction_id)
values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000a001',
   '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000c001',
   8000, 'Café', 'face_pn', 'paid', 'pey_test_a'),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000b001',
   null, null, 5000, 'Otra tienda', 'codi_qr', 'paid', 'pey_test_b');

insert into public.biometric_consents (customer_id, doc_slug, doc_version, doc_sha256, accepted)
values
  ('00000000-0000-4000-8000-00000000c001', 'privacy', 'test', repeat('a', 64), true),
  ('00000000-0000-4000-8000-00000000c002', 'privacy', 'test', repeat('b', 64), true);

insert into public.face_templates (customer_id, embedding, model, model_version, scope)
values (
  '00000000-0000-4000-8000-00000000c001',
  ('[' || array_to_string(array_fill('0.1'::text, array[1024]), ',') || ']')::extensions.vector,
  'human-hse-faceres', '3.3.6', 'global'
);

insert into public.legal_documents (store_id, slug, version, title, body_md, sha256, published)
values
  ('00000000-0000-4000-8000-00000000a001', 'privacy', 'test', 'Aviso',
   '# Aviso', repeat('c', 64), true),
  ('00000000-0000-4000-8000-00000000a001', 'terms', 'test', 'Términos',
   '# Términos (borrador)', repeat('d', 64), false);

insert into public.payment_events (webhook_id, type, payload) values
  ('wh_test_1', 'codi.pn.payment_received', '{"amount":80}');

-- ── kiosk of Store A ────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000d001","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(*)::int from public.transactions),
  1,
  'device A sees only its store transactions'
);

select extensions.is(
  (select count(*)::int from public.stores),
  1,
  'device A sees only its own store'
);

select extensions.is(
  (select count(*)::int from public.devices),
  1,
  'device A sees only itself'
);

select extensions.is(
  (select decision::text from public.identify_customer(
     ('[' || array_to_string(array_fill('0.1'::text, array[1024]), ',') || ']')::extensions.vector,
     'human-hse-faceres', 0.6::real, 0.08::real,
     '00000000-0000-4000-8000-00000000a001')),
  'matched',
  'identify_customer matches the enrolled template'
);

reset role;

-- ── customer A ──────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(*)::int from public.customers),
  1,
  'customer sees only their own profile'
);

select extensions.is(
  (select count(*)::int from public.transactions),
  1,
  'customer sees only their own transactions'
);

select extensions.is(
  (select count(*)::int from public.face_templates_public),
  1,
  'customer sees their template metadata through the view'
);

select extensions.throws_ok(
  'select count(*) from public.face_templates',
  '42501',
  null,
  'customer cannot read face_templates directly'
);

select extensions.is(
  (select count(*)::int from public.biometric_consents),
  1,
  'customer sees only their own consent rows'
);

reset role;

-- ── anon ────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select extensions.is(
  (select count(*)::int from public.legal_documents),
  1,
  'anon sees published legal text only'
);

select extensions.throws_ok(
  'select count(*) from public.transactions',
  '42501',
  null,
  'anon cannot read transactions'
);

select extensions.throws_ok(
  'select count(*) from public.payment_events',
  '42501',
  null,
  'anon cannot read webhook payloads'
);

reset role;

select * from extensions.finish();
rollback;
