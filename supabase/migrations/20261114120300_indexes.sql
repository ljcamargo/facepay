-- Indexes. Only what a query actually needs; every extra index costs writes.

-- Lookup paths
create index staff_store_idx on public.staff (store_id);
create index devices_store_idx on public.devices (store_id);
create index devices_status_idx on public.devices (status) where status = 'active';
create index pairing_codes_store_idx on public.device_pairing_codes (store_id, expires_at desc);
create index customers_phone_idx on public.customers (phone_e164);
create index customers_status_idx on public.customers (status);
create index consents_customer_idx on public.biometric_consents (customer_id, created_at desc);

-- Face templates: one vector index, partial on the rows we actually match.
create index face_templates_customer_idx on public.face_templates (customer_id);
create index face_templates_embedding_idx on public.face_templates
  using hnsw (embedding extensions.vector_cosine_ops)
  where revoked_at is null;

create index sessions_store_idx on public.onboarding_sessions (store_id, created_at desc);
create index sessions_expiry_idx on public.onboarding_sessions (expires_at) where status = 'open';

-- Transactions: the kiosk reads by store+time, the reconciler by status.
create index transactions_store_created_idx on public.transactions (store_id, created_at desc);
create index transactions_pending_idx on public.transactions (status, created_at)
  where status in ('created', 'awaiting_payment');
create index transactions_customer_idx on public.transactions (customer_id, created_at desc);
create index transactions_phone_idx on public.transactions (phone_e164);
create index transactions_session_idx on public.transactions (onboarding_session_id);

create index face_identifications_store_idx
  on public.face_identifications (store_id, created_at desc);
create index face_identifications_customer_idx
  on public.face_identifications (candidate_id, created_at desc);

create index payment_events_status_idx on public.payment_events (status, received_at);
create index payment_events_tx_idx on public.payment_events (transaction_id);

create index audit_log_store_idx on public.audit_log (store_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- Published legal text is read by slug; drafts are listed in the admin view.
create index legal_documents_lookup_idx
  on public.legal_documents (slug, locale, published);
