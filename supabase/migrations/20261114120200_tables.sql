-- Tables. Order matters: parents first, circular FKs added at the end.
-- Money is integer cents. No images anywhere: templates only.

create table public.stores (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  legal_name              text,
  rfc                     text,
  address                 text,
  timezone                text not null default 'America/Mexico_City',
  currency                char(3) not null default 'MXN',
  -- pey banking (never the API key; that lives in Supabase secrets)
  pey_bank_account_id     text,
  -- pilot guardrail, not a security control: the bank authorizes the money
  pilot_limit_cents       integer not null default 30000 check (pilot_limit_cents > 0),
  -- template lifecycle: off by default, yearly re-link when enabled
  template_expiry_enabled boolean not null default false,
  template_ttl_days       integer not null default 365 check (template_ttl_days between 30 and 3650),
  allow_manual_phone_entry boolean not null default false,
  -- kill switch: falls back to QR without touching a deploy
  face_payments_enabled   boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.staff (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  store_id     uuid not null references public.stores (id) on delete cascade,
  role         public.staff_role not null default 'cashier',
  display_name text not null,
  pin_hash     text,
  created_at   timestamptz not null default now()
);

-- Kiosks. auth_uid points at an anonymous Supabase user created on the tablet.
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  label        text not null default 'Tablet',
  status       public.device_status not null default 'pending',
  auth_uid     uuid unique references auth.users (id) on delete set null,
  paired_at    timestamptz,
  last_seen_at timestamptz,
  app_version  text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create table public.device_pairing_codes (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  code_hash  text not null unique,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  claimed_by uuid references public.devices (id) on delete set null,
  claimed_at timestamptz,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);

-- One row per anonymous Supabase user created on the customer's phone.
-- phone_e164 is a CLAIM until a CoDi push is paid: never treat it as verified.
create table public.customers (
  id                uuid primary key references auth.users (id) on delete cascade,
  phone_e164        text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  display_name      text,
  status            public.customer_status not null default 'active',
  locale            text not null default 'es-MX',
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Append-only evidence: what text the customer accepted, and when.
create table public.biometric_consents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  doc_slug    text not null,
  doc_version text not null,
  doc_sha256  text not null,
  accepted    boolean not null,
  ip          inet,
  user_agent  text,
  evidence    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- Vectors only. `scope` decides whether other stores may match this template.
create table public.face_templates (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  store_id      uuid references public.stores (id) on delete set null,
  embedding     extensions.vector(1024) not null,
  model         text not null,
  model_version text not null,
  dim           integer not null default 1024 check (dim = 1024),
  quality       real check (quality between 0 and 1),
  liveness      real check (liveness between 0 and 1),
  source        text not null default 'phone_selfie',
  scope         text not null default 'global' check (scope in ('global', 'store')),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  review_flag   boolean not null default false,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- The QR shown on the tablet when the face is unknown.
create table public.onboarding_sessions (
  id                     uuid primary key default gen_random_uuid(),
  token_hash             text not null unique,
  store_id               uuid not null references public.stores (id) on delete cascade,
  device_id              uuid references public.devices (id) on delete set null,
  amount_cents           integer not null check (amount_cents > 0),
  concept                text not null,
  status                 public.session_status not null default 'open',
  expires_at             timestamptz not null,
  completed_customer_id  uuid references public.customers (id) on delete set null,
  created_transaction_id uuid,
  created_at             timestamptz not null default now()
);

create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores (id) on delete restrict,
  device_id             uuid references public.devices (id) on delete set null,
  customer_id           uuid references public.customers (id) on delete set null,
  onboarding_session_id uuid references public.onboarding_sessions (id) on delete set null,
  -- phone used for manual PN; null for face and QR payments
  phone_e164            text check (phone_e164 ~ '^\+52[0-9]{10}$'),
  amount_cents          integer not null check (amount_cents > 0),
  currency              char(3) not null default 'MXN',
  -- free text; optional in the UI, the server falls back to the store name
  concept               text not null,
  method                public.tx_method,
  status                public.tx_status not null default 'created',
  match_similarity      real,
  liveness              real,
  -- pey
  pey_transaction_id    text unique,
  pey_codi_id           text,
  pey_qr_id             text,
  num_ref               text check (num_ref ~ '^[0-9]{1,7}$'),
  expires_at            timestamptz,
  paid_at               timestamptz,
  late_payment          boolean not null default false,
  amount_mismatch       boolean not null default false,
  -- payer info from the webhook (PII-light)
  payer_clabe_last4     text,
  payer_bank_code       integer,
  -- bookkeeping
  receipt_no            bigint generated by default as identity,
  idempotency_key       text unique,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint paid_needs_provider_id check (status <> 'paid' or pey_transaction_id is not null)
);

-- Audit of every identification attempt: scores and decisions, never vectors.
create table public.face_identifications (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  device_id      uuid references public.devices (id) on delete set null,
  candidate_id   uuid references public.customers (id) on delete set null,
  similarity     real,
  margin         real,
  decision       public.match_decision not null,
  liveness       real,
  quality        real,
  model          text not null,
  threshold_used real,
  latency_ms     integer,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Idempotency + forensics for pey webhooks.
create table public.payment_events (
  id                 bigint generated always as identity primary key,
  webhook_id         text not null unique,
  provider           text not null default 'pey',
  type               text not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'processed', 'orphan', 'error')),
  transaction_id     uuid references public.transactions (id) on delete set null,
  payload            jsonb not null,
  signature_verified boolean not null default false,
  processing_error   text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('staff', 'device', 'customer', 'system')),
  actor_id   uuid,
  store_id   uuid references public.stores (id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The merchant is the data controller, so privacy/consent text is per store.
create table public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references public.stores (id) on delete cascade,
  slug         text not null check (slug in ('about', 'terms', 'privacy', 'biometric-consent')),
  locale       text not null default 'es-MX',
  version      text not null,
  title        text not null,
  body_md      text not null,
  sha256       text not null,
  published    boolean not null default false,
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (store_id, slug, locale, version)
);

-- Postgres-backed rate limiting so it survives function cold starts.
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- Circular FK: a session remembers the transaction it produced.
alter table public.onboarding_sessions
  add constraint onboarding_sessions_tx_fk
  foreign key (created_transaction_id) references public.transactions (id) on delete set null;
