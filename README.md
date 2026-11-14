# FacePay MX

[English](README.md) · [Español](README.es.md)

**Face-linked point-of-sale payments for Mexico, over CoDi® / SPEI via the [pey.mx](https://docs.pey.mx) API.**

A tablet POS where the cashier charges an amount, the customer looks at the camera, and the app
sends a **CoDi® push payment request** to the customer's registered cell phone. The customer
approves it inside their own banking app. Nothing is charged from the tablet.

> **Status: PLANNING (Phase 0, plan v0.2).** No application code yet. Read [`PLAN.md`](PLAN.md)
> (Spanish: [`PLAN.es.md`](PLAN.es.md)). Nothing here is production-ready or legally validated.

---

## What this is (and is not)

| It is | It is not |
| --- | --- |
| An **identification** layer: face → "who is this?" → their phone number | An **authentication** layer: the face never authorizes a payment |
| A CoDi **push request trigger** + webhook receiver | A card acquirer, wallet, or money transmitter |
| A biometric **template** store (vectors only, no photos) | A face-image database |
| A demonstrator for a retail pilot | Compliance-certified biometrics |

The financial authorization happens **inside the customer's bank app** (their bank's own PIN /
face / fingerprint). A spoofed face can at worst send a payment request to the wrong person, who
declines it. That property is what makes a web MVP defensible at all — see
[`docs/07-security-privacy.md`](docs/07-security-privacy.md).

## Stack

- **Web / POS:** TypeScript · React 19 · Next.js (App Router) · Tailwind CSS v4 · shadcn/ui ·
  lucide-react · next-themes (light / dark / auto) · react-markdown · qrcode
- **Face engine (browser):** `@vladmandic/human` (detection + 1024-d embedding + antispoof/liveness
  + hand landmarks), MediaPipe Face Landmarker for the liveness challenge, optional ArcFace ONNX
- **Backend:** Supabase (Postgres + pgvector, Auth, RLS, Realtime, Edge Functions, Cron)
- **Payments:** pey.mx REST API — **CoDi only** (`/codi/pn`, `/codi/qr`, `/transaction/{id}`),
  Standard Webhooks signature verification. No cards, no payment links (v0.2 scope).
- **Deploy:** Netlify (Next.js runtime) + Supabase
- **Future:** Android (needs native liveness / Play Integrity — see
  [`docs/06-face-recognition.md`](docs/06-face-recognition.md))

## Repository layout

```
facepay-mx/
├── README.md / README.es.md      # this file, bilingual
├── PLAN.md                       # scope, flows, phases, open questions  ← start here
├── AGENTS.md                     # collaboration rules for humans + AI agents
├── MEMOIRS.md                    # engineering log (append-only bitácora)
├── netlify.toml                  # Netlify deploy config (Next.js monorepo)
├── docs/
│   ├── 01-architecture.md        # trust boundaries, data flows, why Edge Functions
│   ├── 02-pey-integration.md     # API surface, webhooks, reconciliation, error map
│   ├── 03-database.md            # schema DDL draft, RLS matrix, retention
│   ├── 04-api.md                 # Edge Function endpoint specs
│   ├── 05-ui-screens.md          # routes, ASCII wireframes, Spanish copy deck
│   ├── 06-face-recognition.md    # SDK comparison, models, thresholds, liveness, Android
│   ├── 07-security-privacy.md    # threat model, controls, LFPDPPP checklist
│   ├── 08-risks.md               # risk register
│   ├── 09-runbook.md             # env vars, deploy, rotate, incident steps
│   ├── 10-decisions.md           # ADR log
│   ├── 11-glossary.md            # CoDi, IDC, CLABE, PN, embedding, liveness…
│   └── 12-testing.md             # test matrix + demo script
├── apps/
│   ├── web/                      # Next.js POS + onboarding (Phase 1+)
│   └── android/                  # placeholder, future
├── packages/
│   ├── shared/                   # zod schemas, money, phone, enums, es-MX strings
│   ├── pey-client/               # typed pey.mx client (server-only)
│   └── face-engine/              # browser face capture / liveness / embedding wrapper
├── supabase/                     # migrations, Edge Functions, seed
└── scripts/                      # calibration, reconciliation, ops helpers
```

## The flow in one picture

```
CASHIER                    TABLET (kiosk)                        CUSTOMER PHONE               BANK / BANXICO
   │                            │                                      │                          │
   │ amount + concept ─────────▶│                                      │                          │
   │                            │ camera on, liveness challenge        │                          │
   │                            │ embedding → pgvector match           │                          │
   │                            │                                      │                          │
   │                       ┌────┴─────────────────┐                    │                          │
   │                  match│                      │no match            │                          │
   │                       ▼                      ▼                    │                          │
   │              "¿Eres Ana?"          QR + 3 escape hatches           │                          │
   │                       │             ├ register (phone) ──────────▶│ consent + selfie         │
   │                       │             ├ pay by CoDi QR (render)      │                          │
   │                       │             └ pay by phone, register later │                          │
   │                       ▼                      │                    │                          │
   │            POST /codi/pn  ───────────────────┼───────────────────▶│ push notification ──────▶│
   │                            "Esperando a tu banco…"                 │ approve in bank app ─────▶│
   │                            ◀──────────── webhook codi.pn.payment_received ───────────────────│
   │                            receipt                                 │                          │
```

## Documentation map

| Need | Read |
| --- | --- |
| Scope, phases, what gets committed when | [`PLAN.md`](PLAN.md) |
| How to collaborate on this repo | [`AGENTS.md`](AGENTS.md) |
| What changed and why, over time | [`MEMOIRS.md`](MEMOIRS.md) |
| Plan in Spanish | [`PLAN.es.md`](PLAN.es.md) |
| pey.mx specifics & limits | [`docs/02-pey-integration.md`](docs/02-pey-integration.md) |
| Schema / RLS | [`docs/03-database.md`](docs/03-database.md) |
| Endpoints | [`docs/04-api.md`](docs/04-api.md) |
| Screens & Spanish copy | [`docs/05-ui-screens.md`](docs/05-ui-screens.md) |
| Face models, thresholds, anti-spoofing | [`docs/06-face-recognition.md`](docs/06-face-recognition.md) |
| Legal / privacy / threats | [`docs/07-security-privacy.md`](docs/07-security-privacy.md) |

## Quickstart (Phase 1 — mock UI)

```bash
bun install
bun run dev            # http://localhost:3000/kiosk
```

Phase 1 needs **no env vars**: every screen runs on fixtures. Pairing accepts any 6-digit code,
the settings PIN is `1234`, and the identification branch (known / unknown / ambiguous) is a switch
in Ajustes → Modo demo. Walk it in two tabs: the kiosk plus the QR link it prints.

Phase 2 adds the database:

```bash
cp .env.example .env.local
bunx supabase start
bunx supabase db reset
```

Kiosk: `/kiosk` · Pairing: `/kiosk/setup` · Account: `/mi-cuenta` · Legal: `/legal/privacy`,
`/legal/terms`, `/legal/about`

## Hard warnings

1. **pey.mx has no sandbox.** Docs are explicit: test in production with **$0.01 MXN** and the
   testing CLABE, or your own real account. Never run load tests against the live API key.
2. **CoDi push notifications require the payer's cell to be enrolled in CoDi at their bank.**
   Coverage is partial in Mexico, and cards are out of scope — a customer without CoDi cannot pay at
   all. Always keep the CoDi QR fallback visible and say so honestly.
3. **The kiosk never registers anyone.** Signup happens on the customer's own phone, after the privacy
   notice. The kiosk's identification capture is transient and is never stored or forwarded.
3. **A face is not a password.** It selects *who to bill*. It must never be the sole factor for
   moving money, and this repo never treats it that way.
4. **Biometric templates are sensitive personal data** under Mexican law. Consent, purpose
   limitation, retention and ARCO/deletion are Phase 3 requirements, not Phase 12 nice-to-haves.
   Get counsel review before any real customer is enrolled.
5. **Liveness on the open web is weak.** A high-quality replay can beat browser-only anti-spoofing.
   Cap exposure (pilot limit $300 MXN, rate limits, confirmation screen) until liveness moves to a
   commercial SDK or native Android.
6. **No SMS/OTP in the MVP.** pey has no OTP endpoint, so a phone number is an unverified claim until a
   CoDi push is paid. Read `PLAN.md` §1.3 and §10 before trusting a number for anything.

## License

TBD (proposal: Apache-2.0 for code, CC-BY-4.0 for docs). Do not publish until chosen.
