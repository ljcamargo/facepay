# Supabase — database, auth, functions

Everything privileged lives here. The web app holds only the anon key.

## Local workflow

```bash
supabase start
supabase db reset                         # migrations + seed, from zero
supabase functions serve --env-file supabase/.env.local
supabase db diff -f <name>                # generate a migration from local changes
```

## Layout

```
supabase/
├── config.toml
├── migrations/
│   ├── 20261114000001_extensions.sql
│   ├── 20261114000002_enums_and_tables.sql
│   ├── 20261114000003_indexes.sql
│   ├── 20261114000004_rls.sql
│   ├── 20261114000005_functions.sql
│   └── 20261114000006_triggers.sql
├── functions/
│   ├── _shared/            # auth guards, response helpers, rate limit, pey client re-export
│   ├── face-identify/
│   ├── face-enroll/
│   ├── payments-checkout/
│   ├── payments-push/
│   ├── payments-qr/
│   ├── payments-get/
│   ├── onboarding-sessions/
│   ├── onboarding-pay/
│   ├── devices-claim/
│   ├── webhooks-pey/       # verify_jwt = false
│   └── internal-reconcile/
├── tests/
│   ├── rls.sql             # run as anon / device / customer
│   └── webhook-fixtures/   # recorded payloads, no live calls
└── seed.sql
```

## Rules

- **Migration naming:** `YYYYMMDDHHMMSS_snake_case.sql`, one concern per file, never edited after it
  has been applied anywhere.
- **RLS in the same migration** as the table. A new table with no policies must be unreadable by
  `anon`/`authenticated` (explicit `revoke`).
- **Money and face writes only via functions.** No insert policies on `transactions`, `face_templates`,
  `payment_events`.
- **`security definer`** functions: `set search_path = public, extensions`, and
  `revoke execute from public, anon`.
- **`verify_jwt = false`** only for `webhooks-pey`. Everything else validates the Supabase JWT.
- **No `service_role`** outside Edge Functions.
- Secrets via `supabase secrets set`; local values in `supabase/.env.local` (gitignored).
- Seed data uses fake names/phones and a disabled device. No real numbers.
- Retention jobs (`purge_expired_rows`) scheduled with `pg_cron`; see `docs/03-database.md` §7.

## Function conventions

- `index.ts` exports `Deno.serve(handler)`; logic lives in `handler` with pure helpers next to it.
- Every body validated with a zod schema from `@facepay/shared/schemas`.
- Caller identity derived from the JWT, never from the body.
- Responses: `{ data }` / `{ error: { code, message, requestId } }`.
- CORS: allow the app origin only; `POST, GET, OPTIONS`.
- Logs: JSON, English, `requestId`, masked phone, no embeddings, no API keys.
