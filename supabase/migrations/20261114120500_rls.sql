-- RLS: deny by default, then grant the minimum per role.
-- Postgres grants nothing to anon/authenticated unless we say so; Supabase's
-- default privileges are revoked explicitly below so a new table cannot leak.

alter table public.stores                enable row level security;
alter table public.staff                 enable row level security;
alter table public.devices               enable row level security;
alter table public.device_pairing_codes  enable row level security;
alter table public.customers             enable row level security;
alter table public.biometric_consents    enable row level security;
alter table public.face_templates        enable row level security;
alter table public.onboarding_sessions   enable row level security;
alter table public.transactions          enable row level security;
alter table public.face_identifications  enable row level security;
alter table public.payment_events        enable row level security;
alter table public.audit_log             enable row level security;
alter table public.legal_documents       enable row level security;
alter table public.rate_limits           enable row level security;

-- ── revoke everything, then grant back only what is needed ──────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Public content
grant select on public.legal_documents to anon, authenticated;

-- Customer (own rows)
grant select on public.customers to authenticated;
grant update (display_name, locale, updated_at) on public.customers to authenticated;
grant select, insert on public.biometric_consents to authenticated;
grant select on public.face_templates_public to authenticated;
grant select on public.transactions to authenticated;
grant select on public.face_identifications to authenticated;

-- Kiosk device
grant select on public.stores to authenticated;
grant select on public.devices to authenticated;
grant update (label, app_version, last_seen_at) on public.devices to authenticated;
grant select on public.onboarding_sessions to authenticated;

-- Staff
grant select on public.staff to authenticated;
grant select, insert on public.device_pairing_codes to authenticated;
grant select on public.audit_log to authenticated;

-- Functions (the helpers are used inside policies, so policies need EXECUTE too)
grant execute on function public.current_device_store_id() to authenticated;
grant execute on function public.is_store_staff(uuid) to authenticated;
grant execute on function public.identify_customer(extensions.vector, text, real, real, uuid)
  to authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ── policies ────────────────────────────────────────────────────────────────

-- stores: your kiosk's store, or a store you work for.
create policy stores_select on public.stores
  for select to authenticated
  using (id = public.current_device_store_id() or public.is_store_staff(id));

-- staff: only your own store's roster.
create policy staff_select on public.staff
  for select to authenticated
  using (public.is_store_staff(store_id));

-- devices: your own row, or any device in a store you work for.
create policy devices_select on public.devices
  for select to authenticated
  using (auth_uid = auth.uid() or public.is_store_staff(store_id));

create policy devices_update_own on public.devices
  for update to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- pairing codes: staff create and read them; claiming happens in an Edge Function.
create policy pairing_codes_select on public.device_pairing_codes
  for select to authenticated
  using (public.is_store_staff(store_id));

create policy pairing_codes_insert on public.device_pairing_codes
  for insert to authenticated
  with check (public.is_store_staff(store_id) and created_by = auth.uid());

-- customers: only your own profile row.
create policy customers_select_own on public.customers
  for select to authenticated
  using (id = auth.uid());

create policy customers_update_own on public.customers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- consents: read and append your own. Never update or delete (append-only).
create policy consents_select_own on public.biometric_consents
  for select to authenticated
  using (customer_id = auth.uid());

create policy consents_insert_own on public.biometric_consents
  for insert to authenticated
  with check (customer_id = auth.uid());

-- face_templates: NO policies on purpose. The table is reachable only through
-- identify_customer() and the metadata-only view. A breach here is a breach of
-- biometric templates, so there is no direct path for any client role.

-- onboarding sessions: the kiosk that created them and the staff of the store.
create policy sessions_select on public.onboarding_sessions
  for select to authenticated
  using (store_id = public.current_device_store_id() or public.is_store_staff(store_id));

-- transactions: the device of the store, the customer named in the row, or staff.
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    store_id = public.current_device_store_id()
    or customer_id = auth.uid()
    or public.is_store_staff(store_id)
  );

-- identification audit: the person identified, or staff of the store.
create policy identifications_select on public.face_identifications
  for select to authenticated
  using (candidate_id = auth.uid() or public.is_store_staff(store_id));

-- audit log: staff of the store only.
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.is_store_staff(store_id));

-- legal documents: published only. Drafts stay invisible to clients.
create policy legal_documents_select_published on public.legal_documents
  for select to anon, authenticated
  using (published);

-- payment_events and rate_limits: NO policies, no grants. service_role only.
