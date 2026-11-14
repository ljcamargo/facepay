# 03 — Database

Postgres 15+ on Supabase, `pgvector`, RLS on everything. This file is the design; the executable
version ships in `supabase/migrations/` during Phase 2. Keep them in sync — if they differ after
Phase 2, the migration wins and this file is stale (fix it).

## 1. Conventions

- `id uuid primary key default gen_random_uuid()` except where `auth.users.id` is the identity.
- `created_at timestamptz not null default now()` on every table; `updated_at` via trigger where mutable.
- Money: `amount_cents integer not null check (amount_cents > 0)`. Never `numeric`, never `float`.
- Enums for closed sets; `text` + `check` for open sets (avoids painful enum migrations).
- Every table: `enable row level security`, then explicit `revoke`/`grant`. Supabase grants
  `anon`/`authenticated` broad privileges by default — **revoke first, then grant the minimum**.
- `security definer` functions: `set search_path = public, extensions` and
  `revoke execute from public, anon`.
- Timestamps are UTC (`timestamptz`); the store's timezone lives in `stores.timezone` for display.

## 2. ER diagram

```
auth.users ─1:1─ customers ─1:N─ face_templates
                     │  └─1:N─ biometric_consents
                     └─1:N─ face_identifications
                     └─1:N─ transactions

stores ─1:N─ staff
   ├─1:N─ devices ─1:N─ device_pairing_codes
   ├─1:N─ transactions ─1:N─ payment_events
   ├─1:N─ onboarding_sessions ─0:1─ transactions
   ├─1:N─ face_identifications
   └─1:N─ audit_log

legal_documents (global, public read)
```

## 3. DDL draft

```sql
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── enums ────────────────────────────────────────────────────────────────────
create type public.staff_role       as enum ('owner', 'manager', 'cashier');
create type public.device_status    as enum ('pending', 'active', 'revoked');
create type public.customer_status  as enum ('active', 'blocked', 'deleted');
create type public.tx_status        as enum ('created', 'awaiting_payment', 'paid',
                                             'expired', 'cancelled', 'failed');
create type public.tx_method        as enum ('face_pn', 'manual_pn', 'codi_qr');
create type public.match_decision   as enum ('matched', 'ambiguous', 'no_match',
                                             'low_quality', 'liveness_fail', 'model_error');
create type public.session_status   as enum ('open', 'completed', 'expired', 'cancelled');

-- ── stores ───────────────────────────────────────────────────────────────────
create table public.stores (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  legal_name        text,
  rfc               text,
  address           text,
  timezone          text not null default 'America/Mexico_City',
  currency          char(3) not null default 'MXN',
  -- pey configuration (never the API key; that lives in Supabase secrets)
  pey_bank_account_id text,
  -- pilot guardrail, not a security control: the bank authorizes the money
  pilot_limit_cents integer not null default 30000,          -- $300 MXN
  -- expiry is OFF by default; a store may enable a yearly re-link (shorter optional)
  template_expiry_enabled boolean not null default false,
  template_ttl_days integer not null default 365,   -- only used when enabled
  allow_manual_phone_entry boolean not null default false,
  face_payments_enabled boolean not null default true,   -- kill switch -> QR
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── staff (Supabase Auth users with a role) ──────────────────────────────────
create table public.staff (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  role         public.staff_role not null default 'cashier',
  display_name text not null,
  pin_hash     text,                       -- for kiosk settings / high-amount confirm
  created_at   timestamptz not null default now()
);
create index staff_store_idx on public.staff(store_id);

-- ── devices (kiosks) ─────────────────────────────────────────────────────────
-- auth_uid points at an anonymous Supabase user created on the tablet.
create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  label         text not null default 'Tablet',
  status        public.device_status not null default 'pending',
  auth_uid      uuid unique references auth.users(id) on delete set null,
  paired_at     timestamptz,
  last_seen_at  timestamptz,
  app_version   text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index devices_store_idx on public.devices(store_id);

create table public.device_pairing_codes (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  code_hash   text not null unique,        -- sha256 of the 6-digit code
  created_by  uuid not null references auth.users(id),
  expires_at  timestamptz not null,
  claimed_by  uuid references public.devices(id),
  claimed_at  timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

-- ── customers ────────────────────────────────────────────────────────────────
-- One row per anonymous Supabase user created on the customer's phone at signup.
-- No email, no password, no OTP: see ADR-014 and PLAN.md §1.3.
create table public.customers (
  id            uuid primary key references auth.users(id) on delete cascade,
  -- Unverified claim until a CoDi push is paid (PLAN.md §1.3). Not unique: two
  -- phones may claim the same number; the face, not the number, is the identity.
  -- nullable until signup collects it; a CLAIM, never verified (PLAN.md §1.3)
  phone_e164    text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  display_name  text,                      -- optional first name; used on the confirm screen
  status        public.customer_status not null default 'active',
  locale        text not null default 'es-MX',
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone_e164);

-- ── biometric consent (append-only; legal evidence) ──────────────────────────
create table public.biometric_consents (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  doc_slug      text not null,             -- 'privacy', 'biometric-consent'
  doc_version   text not null,
  doc_sha256    text not null,             -- hash of the exact text shown
  accepted      boolean not null,
  ip            inet,
  user_agent    text,
  evidence      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index consents_customer_idx on public.biometric_consents(customer_id);

-- ── face templates (vectors only, never images) ──────────────────────────────
create table public.face_templates (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  store_id      uuid references public.stores(id) on delete set null, -- null = global
  embedding     extensions.vector(1024) not null,
  model         text not null,             -- 'human-hse-faceres'
  model_version text not null,             -- '3.3.6'
  dim           int  not null default 1024 check (dim = 1024),
  quality       real check (quality between 0 and 1),
  liveness      real check (liveness between 0 and 1),
  source        text not null default 'phone_selfie',  -- phone_selfie | kiosk (post-MVP)
  scope         text not null default 'global' check (scope in ('global', 'store')),
  last_used_at  timestamptz,
  expires_at    timestamptz,               -- null = no expiry (until revoked)
  review_flag   boolean not null default false,        -- set on "no soy yo"
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index face_templates_customer_idx on public.face_templates(customer_id);
create index face_templates_embedding_idx on public.face_templates
  using hnsw (embedding extensions.vector_cosine_ops)
  where revoked_at is null;

-- ── identification audit (no images, ever) ───────────────────────────────────
create table public.face_identifications (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  device_id        uuid references public.devices(id) on delete set null,
  candidate_id     uuid references public.customers(id) on delete set null,
  similarity       real,
  margin           real,                   -- top1 - top2
  decision         public.match_decision not null,
  liveness         real,
  quality          real,
  model            text not null,
  threshold_used   real,
  latency_ms       int,
  transaction_id   uuid,                   -- FK added after transactions exists
  created_at       timestamptz not null default now()
);
create index face_identifications_store_idx on public.face_identifications(store_id, created_at desc);

-- ── transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete restrict,
  device_id             uuid references public.devices(id) on delete set null,
  customer_id           uuid references public.customers(id) on delete set null,
  onboarding_session_id uuid,
  -- phone used for manual PN / deferred-linkage; null for face and QR payments
  phone_e164            text check (phone_e164 ~ '^\+52[0-9]{10}$'),
  amount_cents          integer not null check (amount_cents > 0),
  currency              char(3) not null default 'MXN',
  -- free text; optional in the UI, the server falls back to the store name
  concept               text not null,
  method                public.tx_method,          -- null until a method is chosen
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
  payer_bank_code       int,
  -- bookkeeping
  receipt_no            bigint generated by default as identity,
  idempotency_key       text unique,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint paid_needs_provider_id check (status <> 'paid' or pey_transaction_id is not null)
);
create index transactions_store_created_idx on public.transactions(store_id, created_at desc);
create index transactions_pending_idx on public.transactions(status, created_at)
  where status in ('created', 'awaiting_payment');
create index transactions_phone_idx on public.transactions(phone_e164);
create index transactions_session_idx on public.transactions(onboarding_session_id);

-- ── webhook events (idempotency + forensics) ─────────────────────────────────
create table public.payment_events (
  id                 bigint generated always as identity primary key,
  webhook_id         text not null unique,      -- Standard Webhooks idempotency key
  provider           text not null default 'pey',
  type               text not null,
  status             text not null default 'pending',  -- pending|processed|orphan|error
  transaction_id     uuid references public.transactions(id) on delete set null,
  payload            jsonb not null,
  signature_verified boolean not null default false,
  processing_error   text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);
create index payment_events_status_idx on public.payment_events(status, received_at);

-- ── onboarding sessions (the QR on the tablet) ──────────────────────────────
create table public.onboarding_sessions (
  id                   uuid primary key default gen_random_uuid(),
  token_hash           text not null unique,    -- sha256 of the token in the URL
  store_id             uuid not null references public.stores(id) on delete cascade,
  device_id            uuid references public.devices(id) on delete set null,
  amount_cents         integer not null check (amount_cents > 0),
  concept              text not null,
  status               public.session_status not null default 'open',
  expires_at           timestamptz not null,
  completed_customer_id uuid references public.customers(id) on delete set null,
  created_transaction_id uuid references public.transactions(id) on delete set null,
  created_at           timestamptz not null default now()
);
alter table public.transactions
  add constraint transactions_session_fk
  foreign key (onboarding_session_id) references public.onboarding_sessions(id) on delete set null;
alter table public.face_identifications
  add constraint face_identifications_tx_fk
  foreign key (transaction_id) references public.transactions(id) on delete set null;

-- ── audit log ────────────────────────────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('staff','device','customer','system')),
  actor_id   uuid,
  store_id   uuid references public.stores(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_store_idx on public.audit_log(store_id, created_at desc);

-- ── legal documents (About / Terms / Privacy, rendered by react-markdown) ────
-- The merchant is the data controller, so privacy/consent text is per store.
-- store_id = null is the platform default (About, and fallback copy).
create table public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references public.stores(id) on delete cascade,
  slug         text not null,               -- about | terms | privacy | biometric-consent
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
create index legal_documents_lookup_idx on public.legal_documents(slug, locale, published);

-- ── rate limiting ────────────────────────────────────────────────────────────
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
-- (same trigger on customers, transactions, legal_documents)

-- Resolve the store of the calling device. SECURITY DEFINER avoids RLS recursion.
create or replace function public.current_device_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.devices
  where auth_uid = auth.uid() and status = 'active'
  limit 1;
$$;
revoke execute on function public.current_device_store_id() from public, anon;
grant execute on function public.current_device_store_id() to authenticated;

create or replace function public.is_store_staff(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and store_id = p_store);
$$;
revoke execute on function public.is_store_staff(uuid) from public, anon;
grant execute on function public.is_store_staff(uuid) to authenticated;
```

## 4. Face matching function

Single entry point; the kiosk never touches `face_templates` directly.

```sql
create or replace function public.identify_customer(
  p_embedding   extensions.vector(1024),
  p_model       text,
  p_min_sim     real default 0.60,
  p_min_margin  real default 0.08,
  p_store_id    uuid default null
) returns table (
  decision      public.match_decision,
  customer_id   uuid,
  display_name  text,
  phone_masked  text,
  similarity    real,
  margin        real
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_customer uuid;
  v_sim      real;
  v_margin   real;
begin
  -- best template per customer, then rank customers and compute the top-1 margin
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

  v_sim    := coalesce(v_sim, 0);
  v_margin := coalesce(v_margin, 0);

  if v_customer is null or v_sim < p_min_sim then
    return query select 'no_match'::public.match_decision, null::uuid, null::text, null::text,
                        v_sim, v_margin;
  elsif v_margin < p_min_margin then
    -- never guess: two candidates are too close
    return query select 'ambiguous'::public.match_decision, null::uuid, null::text, null::text,
                        v_sim, v_margin;
  else
    return query
      select 'matched'::public.match_decision, c.id, c.display_name,
             '•••• ' || right(c.phone_e164, 4), v_sim, v_margin
      from public.customers c
      where c.id = v_customer;
  end if;
end $$;

revoke execute on function public.identify_customer(extensions.vector, text, real, real, uuid)
  from public, anon;
grant execute on function public.identify_customer(extensions.vector, text, real, real, uuid)
  to authenticated;
```

Notes:
- `<=>` is cosine distance; `1 - distance` = cosine similarity. Normalize embeddings to unit length
  at write time so this stays cheap and stable.
- `distinct on (customer_id)` collapses multiple templates per person (max 3).
- A `p_store_id` guarantees that a template enrolled in store A can be scoped out later if a merchant
  demands isolation; `store_id = null` means global.
- Thresholds are **not** cosmology: they come from `scripts/calibrate.ts` on a real, consented set.
  Changing the model invalidates the threshold and requires re-enrollment (see `docs/06`).

## 5. RLS matrix

| Table | anon | authenticated (customer) | authenticated (device) | staff | service_role |
| --- | --- | --- | --- | --- | --- |
| `stores` | – | – | select own row | select own store | all |
| `staff` | – | – | – | select own store | all |
| `devices` | – | – | select/update own row | all in store | all |
| `device_pairing_codes` | – | – | – | insert/select own store | all |
| `customers` | – | select/update own | – (via RPC only) | select own store via tx | all |
| `biometric_consents` | – | select/insert own | – | select own store | all |
| `face_templates` | – | select count of own (no embedding) | – | – | all |
| `face_identifications` | – | select own (if customer) | insert via function | select own store | all |
| `transactions` | – | select own | select own store | select/insert own store | all |
| `payment_events` | – | – | – | – | all |
| `onboarding_sessions` | – | select by token via RPC | select/insert own store | select own store | all |
| `audit_log` | – | – | – | select own store | all |
| `legal_documents` | select where published | same | same | same | all |

`legal_documents` is read with `store_id is null or store_id = current store/customer store`; the
privacy + consent text rendered at enrollment is always the **merchant's** version, and the accepted
`sha256` is stored in `biometric_consents.doc_sha256`.

Enforcement notes:
- Never `grant` `insert`/`update` on `transactions` to `authenticated`; all writes go through Edge
  Functions with `service_role`.
- `face_templates`: expose only a view for the owner (`select id, created_at, source, model`), never
  the `embedding` column. Deleting a template is allowed for the owner (right to erasure) — implement
  as `update ... set revoked_at = now()` through an RPC that also writes `audit_log`.
- `payment_events`: service role only. This table contains full payer metadata (CLABE).
- Realtime: `alter publication supabase_realtime add table public.transactions;` — RLS still applies.

## 6. Triggers and RPCs to write in Phase 2

| Name | Type | Purpose |
| --- | --- | --- |
| `handle_new_auth_user` | trigger on `auth.users` | create a `customers` row on first sign-in (anonymous) |
| `set_updated_at` | trigger | timestamps |
| `create_onboarding_session` | RPC (device) | token generation, hashing, TTL *(Phase 6)* |
| `claim_onboarding_session` | RPC (customer) | bind token to authed customer, check TTL/status *(Phase 6)* |
| `set_my_phone(text)` | RPC (customer) | normalize to E.164, upsert profile, audit — **done** |
| `revoke_my_face()` | RPC (customer) | soft-delete caller templates, return count, audit — **done** |
| `delete_my_account()` | RPC (customer) | revoke templates, null phone/name, status `deleted` — **done** |
| — | — | *(removed: phone-based retro-linkage needs a verified number; see ADR-014)* |
| `check_rate_limit` | function | atomic counter per key/window (service_role only) |

Migration files as applied: `…120000_extensions`, `…120100_types`, `…120200_tables`,
`…120300_indexes`, `…120400_functions`, `…120500_rls`, `…120600_realtime`,
`…120700_fix_identify_ambiguity`, `…120800_customer_rpcs`, `…120900_fix_auth_trigger`.
`legal_documents` stays empty for now: the consent hash recorded in `biometric_consents` is the
SHA-256 of the markdown the app renders (`apps/web/content/legal/*.md`), so there is one source.
Also note: anonymous users have `raw_app_meta_data = {}` — use `auth.users.is_anonymous`, not the
provider field, to detect them.

## 7. Retention

| Data | Retention | Mechanism |
| --- | --- | --- |
| `face_templates` | until revoked; TTL 180 d, re-confirm to 2×TTL, then re-enroll | `expires_at` + nightly job |
| `face_identifications` | 90 days | nightly `delete` (pg_cron) |
| `transactions` | 5 years (accounting) | never delete; anonymize on request |
| `payment_events` | 2 years | archive then delete |
| `audit_log` | 2 years | archive then delete |
| `device_pairing_codes` | 24 h | nightly delete |
| `onboarding_sessions` | 7 days after close | nightly delete |

Deletion must cascade from `auth.users` → `customers` → templates/consents. Accounting rows keep
`amount_cents`, `paid_at` and drop `customer_id`/`phone_e164` (replace with an irreversible hash) so
the merchant's books stay valid without retaining the identity.
