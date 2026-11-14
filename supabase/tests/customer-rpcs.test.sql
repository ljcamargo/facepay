-- Phase 3 contract: a customer can set their phone, revoke their face and delete
-- their account — and cannot touch anything else.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

insert into auth.users
  (id, instance_id, aud, role, is_anonymous, email, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', true, 'cust-p3@example.test',
   '{"provider":"anonymous"}', now(), now());

insert into public.stores (id, name) values
  ('00000000-0000-4000-8000-00000000a101', 'Store P3');

select extensions.is(
  has_column_privilege('authenticated', 'public.customers', 'phone_e164', 'update'),
  false,
  'customer cannot write phone_e164 directly'
);

-- Revocation only affects the caller's templates.
insert into public.face_templates (customer_id, embedding, model, model_version)
values (
  '00000000-0000-4000-8000-00000000c101',
  ('[' || array_to_string(array_fill('0.2'::text, array[1024]), ',') || ']')::extensions.vector,
  'human-hse-faceres', '3.3.6'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c101","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select public.set_my_phone('55 1234 5678')),
  '+525512345678',
  'set_my_phone normalizes to E.164'
);

select extensions.is(
  (select phone_e164 from public.customers where id = auth.uid()),
  '+525512345678',
  'phone is persisted on the caller row'
);

select extensions.throws_ok(
  'select public.set_my_phone(''123'')',
  '22023',
  null,
  'set_my_phone rejects invalid numbers'
);

select extensions.is(
  (select public.revoke_my_face()),
  1,
  'revoke_my_face revokes the caller template'
);

select extensions.is(
  (select count(*)::int from public.face_templates_public),
  0,
  'revoked template disappears from the owner view'
);

select extensions.is(
  (select decision::text from public.identify_customer(
     ('[' || array_to_string(array_fill('0.2'::text, array[1024]), ',') || ']')::extensions.vector,
     'human-hse-faceres', 0.6::real, 0.08::real, null::uuid)),
  'no_match',
  'a revoked template can no longer identify anyone'
);

reset role;

select * from extensions.finish();
rollback;
