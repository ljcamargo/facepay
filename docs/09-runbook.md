# 09 — Runbook

Commands assume `bun` and a checkout at the repo root. Nothing here is final until Phase 1–2 land;
update it as soon as a command changes.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 22 LTS | `.nvmrc` |
| bun | 1.1+ | `curl -fsSL https://bun.sh/install \| bash` |
| Supabase CLI | latest | `bunx supabase ...` (no global install needed) |
| Docker | running | needed by `supabase start` |
| Deno | 2.x | optional; the CLI bundles it for functions |
| tunnel | `cloudflared` or `ngrok` | pey webhooks need a public HTTPS URL |

## 2. Environment variables

`.env.local` (web, public by definition):

| Var | Example | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcd.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` | public; RLS protects everything |
| `NEXT_PUBLIC_APP_URL` | `https://facepay.example` | used to build onboarding links/QRs |
| `NEXT_PUBLIC_SENTRY_DSN` | empty | optional |

Supabase secrets (`supabase secrets set --env-file supabase/.env.production`):

| Var | Notes |
| --- | --- |
| `PEY_API_KEY` | **live** or test key; never in the web bundle |
| `PEY_API_BASE` | `https://api.pey.mx` |
| `PEY_WEBHOOK_SECRET` | `whsec_…`, rotates in the pey portal |
| `CRON_SECRET` | random 32 bytes; header `x-cron-secret` |
| `APP_URL` | used to build onboarding links and QR URLs |
| `FACE_MIN_SIMILARITY` | default `0.60` (per-store override in DB) |
| `FACE_MIN_MARGIN` | default `0.08` |
| `SMS_PROVIDER_KEY` | only if using the Send SMS Hook with a custom provider |
| `SUPABASE_SERVICE_ROLE_KEY` | injected automatically in Edge Functions |

Never commit any of these. `.env.example` lists names with empty values only.

## 3. First-time setup (cloud project — no Docker)

Docker is **only** needed for the local stack (`supabase start`). This project runs against a
dedicated cloud project; migrations and RLS tests work without a container runtime.

```bash
git clone <repo> && cd facepay-mx
bun install
cp .env.example apps/web/.env.local     # fill the two public Supabase values

# one-time
bunx supabase login
bunx supabase link --project-ref <ref>   # reads SUPABASE_DB_PASSWORD if exported

# apply schema + seed to the linked project
SUPABASE_DB_PASSWORD=... bunx supabase db push --remote --include-seed --yes

# RLS contract without Docker
# (`supabase test db --remote` shells out to Docker for pg_prove; this runner does not)
SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
  bun run test:rls:remote

bun run dev                              # http://localhost:3000/kiosk
```

Notes:
- The DB password is **not** stored in the repo. Keep it in a password manager; export
  `SUPABASE_DB_PASSWORD` per shell.
- `SUPABASE_DB_URL` is the pooler URL (session mode, port 5432), also not committed.
- `bunx supabase db reset --remote` would drop the schema. Don't. To re-apply from zero on a
  throwaway project, create a new project instead.
- Optional local stack: `bunx supabase start` (needs Docker) then `bunx supabase db reset`.

Seed creates one store. Staff and devices are not seeded: they need `auth.users` rows, which only
the Auth API should create.

## 3.1 Netlify deploy (the path we actually use)

The kiosk needs HTTPS for `getUserMedia`, so the tablet talks to a Netlify deploy instead of the LAN.

**Site settings that matter** (Project configuration → Build & deploy):

| Setting | Value |
| --- | --- |
| Base directory | **empty** (repo root) |
| Package directory | **empty** |
| Build command | from `netlify.toml` |
| Publish directory | from `netlify.toml` (`apps/web/.next`) |

Do **not** set the base directory to `apps/web`: Netlify would install dependencies there, where there
is no lockfile and `workspace:*` cannot be resolved by npm.

**Environment variables:**

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key |
| `NEXT_PUBLIC_APP_URL` | `https://<site>.netlify.app` (set after the first deploy) |
| `NEXT_PUBLIC_MOCK_MODE` | `true` until Phases 6–8 wire the kiosk |

`bun run check:env` runs during the build and fails it if a key is missing or if the anon key looks
like a secret. The build also runs `bun run models:sync` (16 MB, not in git).

Auth redirect URLs for the cloud project: `https://<site>.netlify.app` and
`https://<site>.netlify.app/**` (Auth → URL configuration). Anonymous sign-ins must stay enabled.

**Deploy from the CLI instead of Git:**

```bash
bunx netlify login
bunx netlify init            # or: netlify sites:create --name facepay-mx
bunx netlify env:set NEXT_PUBLIC_SUPABASE_URL https://<ref>.supabase.co
bunx netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY <anon>
bunx netlify env:set NEXT_PUBLIC_MOCK_MODE true
bunx netlify deploy --build --prod
```

## 4. Pointing pey at a local webhook

pey allows one webhook per API key, and it must be HTTPS.

```bash
cloudflared tunnel --url http://localhost:54321
# → https://random-words.trycloudflare.com/functions/v1/webhooks-pey
```

Paste that URL in the pey portal (Developer → gear → Webhook). Save the `whsec_…` secret into
`supabase/.env.local`, restart `functions serve`. **Remember to restore the staging URL afterwards** —
a forgotten tunnel means silent webhook loss in staging.

Alternative: use the deployed staging function and read its logs (`supabase functions logs
webhooks-pey`), avoiding tunnels entirely.

## 5. Deploy

```bash
# database
supabase db push                       # staging
supabase db push --project-ref <prod>  # production, after review

# functions (all, or one)
supabase functions deploy webhooks-pey --no-verify-jwt
supabase functions deploy payments-push face-identify face-enroll devices-claim \
  onboarding-sessions internal-reconcile

# web
git push origin main                   # Netlify builds apps/web
```

`netlify.toml` sets `base = "apps/web"`; Netlify installs from the repo root so the workspace
packages resolve. Environment variables live in Netlify (Site settings → Environment).

## 6. Supabase settings checklist

- Auth → Providers: Phone enabled; SMS provider set (Twilio); WhatsApp channel if available.
- Auth → Providers: Anonymous sign-ins enabled (kiosk).
- Auth → Rate limits: anonymous sign-ins per hour lowered to a sane value; CAPTCHA on public pages.
  (OTP is out of scope in the MVP — see ADR-014.)
- Auth → URL configuration: `https://<app>/auth/callback`, `http://localhost:3000/auth/callback`.
- Database → Extensions: `vector`, `pgcrypto`, `pg_cron`, `pg_net`.
- Realtime: `transactions` added to the publication.
- Edge Functions: `verify_jwt = false` **only** for `webhooks-pey`.
- Backups: PITR on for production if the plan allows; otherwise daily + weekly restore drill.

## 7. Cron

```sql
select cron.schedule('reconcile-payments', '*/2 * * * *', $$
  select net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/internal-reconcile',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
    body    := '{"limit":20}'::jsonb
  );
$$);

select cron.schedule('purge-retention', '0 3 * * *', $$ select public.purge_expired_rows(); $$);
```

Verify: `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 10;`

## 8. Secret rotation

| Secret | Where | Steps |
| --- | --- | --- |
| pey API key | pey portal → Developer | create new key → `supabase secrets set PEY_API_KEY=…` → redeploy functions → delete old key |
| pey webhook secret | pey portal → gear → rotate | copy new `whsec_` → set secret → redeploy → send a test event |
| `CRON_SECRET` | generated | set secret → update the cron job SQL → redeploy |
| Supabase JWT secret | dashboard | rotates all sessions: customers re-login, kiosks must re-pair (announce) |
| `service_role` | dashboard | same as above; also re-run the RLS test suite |

Log every rotation in `MEMOIRS.md` (date + what, never the value).

## 9. Restore / disaster

```bash
# nightly logical backup (if PITR is unavailable)
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -Fc > backup-$(date +%F).dump

# restore into a scratch project only
pg_restore --no-owner --no-privileges -d "$SCRATCH_DB_URL" backup-$(date +%F).dump
```

Drill once before the pilot: restore into scratch, run the RLS suite, verify a receipt can be
reconstructed. Never restore production into staging without masking `customers.phone_e164`.

## 10. Incident quick actions

```sql
-- kill switch: stop face payments for one store
update stores set max_face_amount_cents = 0 where id = '<store>';

-- revoke a kiosk
update devices set status = 'revoked' where id = '<device>';

-- revoke every template of a customer (right to erasure)
update face_templates set revoked_at = now() where customer_id = '<uuid>';

-- inspect orphan webhooks
select id, type, received_at, processing_error from payment_events where status = 'orphan';
```

Then: rotate secrets (§8), notify per `docs/07` §8, write the `MEMOIRS.md` entry.

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Kiosk shows pairing screen forever | anonymous user has no `devices` row / revoked | re-pair; check `devices.status` |
| `401` from functions except webhook | JWT expired or `verify_jwt` misconfigured | refresh session; check function config |
| Camera black on iPad | permission denied / not HTTPS / low-power mode | Safari settings, HTTPS, wake lock |
| Face models 404 | `public/models/human/` not deployed | check build output size; re-run the model sync script |
| "No pudimos identificarte" always | threshold too high after a model change | re-calibrate; check `face_identifications.similarity` distribution |
| PN never arrives | phone not enrolled in CoDi / wrong number | verify with the customer; use QR |
| Webhook 401 | wrong secret or clock skew | rotate secret; check server time |
| Payment paid in bank, no receipt | webhook lost | reconciliation cron; `GET /transaction/{id}`; check `payment_events` |
| Duplicate receipts | webhook id not deduped | inspect `payment_events.webhook_id` unique index |
| Netlify build fails on workspace imports | `base`/install misconfigured | `netlify.toml` `base = "apps/web"`, build from root |

## 12. Cost watch

| Item | Rough cost | Note |
| --- | --- | --- |
| Supabase | free → $25/mo | two projects (staging/prod) |
| Netlify | free → $19/mo | Next.js runtime included |
| OTP (post-MVP) | ~$0.05–0.09 per message | only if SMS/WhatsApp verification is added (ADR-014) |
| pey | API free per docs | bank/SPEI fees may apply to the merchant account |
| Testing | ~$5–10 one-time | $0.01 transactions, real money |
