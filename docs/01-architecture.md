# 01 — Architecture

## 1. Shape

```
┌──────────────────────────────────────────────────────────────┐
│  Tablet kiosk (Chrome kiosk mode, landscape)                  │
│  Next.js client components only                              │
│  • camera + quality gates + liveness (WASM)                   │
│  • embedding (1024-d) computed locally                        │
│  • Realtime subscription for the waiting screen               │
└───────────────┬──────────────────────────────────────────────┘
                │ anon key + device JWT (anonymous auth)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase                                                     │
│  ┌────────────┐  ┌─────────────────────────────────────────┐ │
│  │ Auth       │  │ Edge Functions (Deno)                    │ │
│  │ • customer │  │ • /face/identify  → pgvector RPC         │ │
│  │  anonymous │  │ • /payments/*     → pey client           │ │
│  │ • kiosk    │  │ • /webhooks/pey   → verify + idempotent   │ │
│  │   anonymous│  │ • /onboarding/*   │ /devices/claim       │ │
│  │ • staff    │  │   PEY_API_KEY lives here (secret)        │ │
│  │   email+pw │  └───────────────┬─────────────────────────┘ │
│  └────────────┘                  │ service_role               │
│  ┌───────────────────────────────▼─────────────────────────┐ │
│  │ Postgres: RLS everywhere · pgvector (HNSW) · enums      │ │
│  │ transactions · face_templates · payment_events · audit  │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (Bearer API key, server-side only)
                ▼
        pey.mx  ──▶  Banxico CoDi®  ──▶  customer bank app
                ◀── webhook (Standard Webhooks HMAC)
```

**Next.js on Netlify serves UI and static assets only.** It has no pey key, no service role, and no
business logic that moves money. Everything sensitive is inside Supabase.

## 2. Why Edge Functions instead of Next.js API routes

| Driver | Edge Functions | Next.js on Netlify |
| --- | --- | --- |
| Secret locality | one place, next to the DB | duplicated across deploys/envs |
| Webhook uptime | independent of frontend redeploys | coupled to the web app deploy |
| Timeouts | generous for a fast pey call | 10 s default / 26 s max sync |
| Reuse by future Android app | same functions | would need a second server |
| Cold start | ~100–400 ms | comparable |
| DX cost | Deno + `supabase functions serve` | single `next dev` |

Chosen because the webhook/cron logic must not be coupled to a Netlify deploy, and because Android
will need the same endpoints. Trade-off: two runtimes to keep in sync (Next + Deno). Mitigated by
keeping domain types in `packages/shared` (imported by both through `npm:`/workspace paths).

## 3. Trust boundaries

| Boundary | Trust | Control |
| --- | --- | --- |
| Tablet browser | **untrusted** (physically accessible) | device JWT, RLS scoped to one store, no secrets, rate limits, amount cap |
| Customer phone browser | **untrusted** | anonymous session JWT (phone unverified), RLS scoped to own rows, consent required before enroll |
| Edge Function | trusted | validates every input with zod; verifies caller JWT and store membership |
| Webhook | **untrusted until verified** | HMAC + timestamp + replay cache + `apiKeyId` check |
| pey API | trusted for payment state | we re-read `GET /transaction/{id}` on dispute |
| Postgres | trusted | RLS, `security definer` functions with pinned `search_path` |
| Netlify CDN | public | no secrets in the bundle (checked in CI) |

## 4. Two state machines

### 4.1 Transaction

```
created ──▶ awaiting_payment ──▶ paid
   │              │  │            ▲
   │              │  └──▶ expired │ (late webhook: paid + late_payment=true)
   │              ├──▶ cancelled ─┘
   │              └──▶ failed  (pey 4xx, no retry)
   └──▶ abandoned  (no method chosen, TTL 2 min)
```

`status` never goes backwards. `paid` is terminal. A second `paid` event is a no-op (idempotent).

### 4.2 Identification attempt

```
start ─▶ quality_ok? ──no──▶ retry (max 3)
              │yes
              ▼
        liveness_ok? ──no──▶ challenge retry (max 2) ──▶ fallback_qr
              │yes
              ▼
        match decision: matched | ambiguous | no_match | model_error
              │
              ├─ matched   → confirm screen (user can reject → flag template)
              ├─ ambiguous → no_match UX (never guess)
              └─ no_match  → fallback screen
```

Every attempt writes `face_identifications` (scores, decision, no image). This table is the audit
trail used for threshold calibration and for answering "why was I charged?".

## 5. Realtime strategy

The waiting screen subscribes to `postgres_changes` on `transactions` filtered by `id=eq.<tx>`
(and, for the onboarding handoff, `onboarding_session_id=eq.<id>`). RLS applies to Realtime, so a
device only sees its own store.

Fallbacks, in order: (1) `postgres_changes`, (2) 2 s poll of `/payments/{id}`, (3) manual
"Ya pagué, actualizar". All three call the same status endpoint, so a Realtime outage degrades
instead of breaking.

## 6. Failure philosophy

- **Degrade, never dead-end.** Every screen that can fail has a visible path to CoDi QR.
- **Fail closed on identity** (ambiguous → no match), **fail open on payment method**
  (pey error → show QR).
- **Never charge twice.** One `idempotency_key` per checkout attempt; one `webhook_id` per delivery.
- **Never lose a payment.** If a webhook arrives for an unknown/expired transaction, store it in
  `payment_events` with `orphan` status and alert; reconciliation resolves it. Money that landed in
  the merchant account must appear in the DB even if our state machine disagreed.

## 7. Local development topology

```
pnpm dev                → Next.js :3000
pnpm supabase start     → API :54321, DB :54322, Studio :54323, Functions :54321/functions/v1
ngrok / cloudflared     → public webhook URL for pey (pey requires HTTPS)
```
pey webhooks can only point at a public HTTPS URL configured in their portal, so local webhook work
needs a tunnel. Alternative: point the portal at the deployed staging function and develop against
that (documented in the runbook).

## 8. Deployment topology

| Env | Web | Functions/DB | pey key |
| --- | --- | --- | --- |
| local | `next dev` | `supabase start` | test key (still production API!) |
| staging | Netlify deploy preview / branch deploy | Supabase project `staging` | same test key, $0.01 only |
| prod | Netlify production | Supabase project `prod` | live key, real amounts |

Two Supabase projects minimum before the pilot. Never let a staging webhook URL and a production
webhook URL share an API key — pey allows only one webhook per key.
