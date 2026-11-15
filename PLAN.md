# PLAN — FacePay MX (v0.2, 2026-11-14)

Planning artifact for a tablet POS that identifies customers by face and requests payment through
**CoDi® push** via **pey.mx**. This document is the source of truth for scope and phase boundaries.
Implementation details live in `docs/`. Spanish mirror: [`PLAN.es.md`](PLAN.es.md).

**Status:** awaiting approval of Phase 0. No application code exists.

## Changelog

- **v0.2 (2026-11-14):** scope tightened to CoDi only (no cards, no payment links); the kiosk no longer
  registers anyone — signup happens on the customer's own phone; no SMS/OTP in the MVP; pilot cap
  lowered to **$300 MXN**; template scope + expiry added; Spanish plan added.
- v0.1: first research pass.

---

## 0. TL;DR

- **pey.mx needs no customer account.** We POST a phone number + amount; Banxico delivers a CoDi push;
  the customer approves in their bank app; we receive a signed webhook. The customer needs **CoDi
  active at their bank**, not a Pey account. → `docs/02-pey-integration.md`
- **pey sends no OTP.** Its API has no SMS/verification endpoint; the only message the customer
  receives from our side is the CoDi push, delivered by their bank. → §1.3
- **CoDi QR is the base product; the face replaces scanning it.** The face is an accelerator over a
  flow that already works, not a new payment method.
- **The kiosk never registers anyone.** If the face is unknown, the kiosk shows a QR; the customer
  signs up on their own device, at their own pace, with their own face.
- **Face = identification, not authentication.** The bank authorizes the money. This is the
  load-bearing decision and it is stated in the UI, not just in the docs.
- **Backend = Supabase Edge Functions** (Pey key + webhook live next to the DB). Next.js on Netlify is
  UI only and holds no secrets.
- **Pilot guardrails:** $300 MXN per face-initiated charge, 3 pushes / 10 min / customer. Template
  expiry is **off by default**; a store may enable a yearly re-link (shorter windows optional).
- **Outstanding security work is written down**, not forgotten: §10 and `docs/07` §9.

---

## 1. Research findings

### 1.1 What pey does (and does not do)

| Question | Answer |
| --- | --- |
| Who delivers the push? | Banxico, at pey's request. pey → Banxico → the customer's bank app. |
| Do we implement payments? | **No.** One HTTP call + one webhook. Settlement is bank-to-bank. |
| Does the customer need a pey account? | **No.** Only the merchant, at `portal.mipey.mx` + a linked CoDi bank account. |
| Does the customer need CoDi? | **Yes** — active in their bank app **and their cell enrolled** with that bank. |
| Can we cancel a sent PN? | **No public endpoint.** We expire it locally; a late approval still arrives and is recorded. |
| How do we learn it was paid? | Webhook `codi.pn.payment_received`, plus `GET /transaction/{id}` for reconciliation. |
| Sandbox? | **No.** Docs say test in production with $0.01. |
| Webhook auth? | Standard Webhooks (HMAC-SHA256, `webhook-id`, 300 s tolerance). |
| **OTP / SMS API?** | **None.** pey cannot verify a phone number for us. |
| Limits | amount `>0` ≤ 1,000,000; phone `^[0-9]{10}$`; `numRef` `^[0-9]{1,7}$`; PN `expiration ≥ 360`; QR `expiration = 0` or `≥360`. |
| Metadata | ≤50 scalar pairs, echoed back as `metadata.externalMetadata` — our webhook join key. |
| Webhook per key | **One URL per API key**, all event types. |

### 1.2 Two provider constraints that shape the product

1. **CoDi coverage is partial.** A customer without CoDi cannot pay by push *or* by CoDi QR. Because
   cards are out of scope (v0.2), this is a hard ceiling on reach and must be stated plainly, not
   papered over.
2. **We cannot verify a phone number.** Consequence in §1.3.

### 1.3 Identity of the customer, without SMS

Supabase Auth phone OTP was the original plan. v0.2 removes it for the MVP (cost, provider,
deliverability). What remains:

- The customer's phone creates an **anonymous Supabase session** during signup.
- `customers.phone_e164` is a **claim, not a verified attribute** (`phone_verified_at` stays `null`).
- The **only real proof of phone control** is a successfully paid CoDi push: if the person approves
  the request in their bank app, they demonstrably hold that account and that number.
- Therefore: we never treat the phone as verified, we never share data based on it, and "link my past
  purchases by phone" is cut from the MVP.

Residual risk: someone can sign up with a number that is not theirs and start sending themselves the
requests (they pay for their own purchases), or bind a stranger's face to their own number (harassment
of the stranger, who can decline). Both are documented in `docs/08-risks.md` (R09, R12) and are
acceptable for a demonstrator with a $300 cap.

**Future options, documented not built:** (a) SMS/WhatsApp OTP via Supabase's Send SMS Hook;
(b) "auth by paid push" — a $0.01 CoDi request that, once approved, proves phone control;
(c) device passkeys on the customer's phone.

---

## 2. Payment paths

CoDi only. No cards, no Apple/Google Pay, no payment links.

| # | Path | Who | pey call | Registration |
| --- | --- | --- | --- | --- |
| **A** | Face → push | Registered customer | `POST /codi/pn` | yes, once |
| **B** | CoDi QR on the tablet | Anyone with CoDi | `POST /codi/qr` | no |
| **C** | Type your number *on your own phone* → push | Anyone willing | `POST /codi/pn` | no (can register later) |

B is the base flow and the universal fallback. A is "the same thing, without scanning". C exists
because it is the only way to pay by push without giving a face, and because the number is typed on
the customer's device — never on the shared tablet.

---

## 3. Flows

### 3.1 Registered customer (target < 12 s)

1. Cashier enters amount + concept (presets + free text).
2. `POST /payments/checkout` → `transactions` row `created`, amount frozen server-side.
3. Kiosk camera + quality gate + random liveness challenge (blink / turn / smile / **show 2 fingers**).
4. Embedding computed in-browser; the frame never leaves the device.
5. `POST /face/identify` → pgvector top-2 → `matched` | `ambiguous` | `no_match`.
6. `matched` → "¿Eres Ana? · •••• 5678" → "Sí, enviar solicitud a mi banco" / "No soy yo".
7. `POST /payments/push` → pey `POST /codi/pn` (600 s, `numRef`, `metadata.txId`).
8. Waiting screen: countdown, "Ya pagué, actualizar", "Cancelar", "Usar QR".
9. Webhook → `paid` → Realtime → receipt.

### 3.2 Newcomer (kiosk shows a QR, never registers)

1. `no_match` → fallback screen: **"Regístrate y paga con tu rostro"** (QR) + **"Pagar con QR CoDi"**
   + **"Pagar con mi celular"**. The sale can always continue without registration.
2. QR = `https://app/onboarding/<token>`; token = 32 random bytes, SHA-256 stored, 15 min TTL, bound
   to store + amount + device. Nothing about the face is sent to the phone in the MVP.
3. Customer's phone: 10-digit number → privacy notice + explicit biometric consent → **selfie with
   liveness on their own device** → template stored → "Pagar $80.00".
4. Phone triggers the push; the tablet flips to the waiting screen via Realtime on the session.
5. If they abandon at any step, the tablet returns to idle on timeout and the customer can still pay
   with the CoDi QR on screen.

Why the kiosk does not capture the enrollment: it would process a face before the notice was shown and
would let anyone bind a bystander's face to their own number. The kiosk's identification capture is
transient and is never stored (§10.1).

**Post-MVP optimization (not built):** the kiosk hands its in-memory embedding to the phone session
after consent, and the phone sends a single confirm frame; the server requires that frame to match the
kiosk vector before activating the template. Saves ~8 s, adds consent-ordering and replay edge cases.

### 3.3 Pay by CoDi QR (no registration, no face)

Kiosk `POST /payments/qr` → renders `qrString` client-side → customer scans with their bank app →
webhook `codi.qr.payment_received` → receipt. QR expires in 10 min; "generar otro" reuses the same
transaction when possible.

### 3.4 Pay by phone, no face

On the customer's phone (via the same QR page, `?mode=pay`): type number → consent to receive a push →
push → approve. No template is stored. This is the path for people who refuse biometrics.

### 3.5 Failure branches

| Branch | Behaviour |
| --- | --- |
| Camera denied / no camera | QR paths + "pedir apoyo al cajero" |
| 2+ faces, blur, angle, dark | Inline hint, no request sent |
| Liveness fail ×3 | 60 s cooldown, fall back to QR |
| `ambiguous` (top1−top2 < margin) | Never guess. "No pudimos identificarte con seguridad" → QR |
| "No soy yo" | Template flagged for review, audit row, fallback |
| pey 4xx (number not on CoDi) | "Ese número no tiene CoDi activo" → QR |
| pey 5xx / timeout | One retry, then QR + alert |
| No webhook in 6 min | "No recibimos confirmación" → retry (≤3/10 min) or QR |
| Late payment after cancel | Webhook wins: `paid` + `late_payment`, receipt + cashier banner |

---

## 4. Screens (full wireframes and copy: `docs/05-ui-screens.md`)

```
/kiosk/checkout → /kiosk/identify → /kiosk/confirm → /kiosk/pay/{id} → /kiosk/receipt/{id}
                       │
                       └─ no_match → /kiosk/fallback ─┬─ QR register  → /onboarding/{token}
                                                      ├─ CoDi QR      (in place)
                                                      └─ pay by phone → /onboarding/{token}?mode=pay
```

Every screen carries the disclosure line: **"El rostro solo identifica. El pago lo autorizas en tu
banco."** The confirm screen adds: **"No autorizamos cobros. Tu banco pide tu aprobación."**

---

## 5. Data model (DDL: `docs/03-database.md`)

```
auth.users (anonymous) ─1:1─ customers ─1:N─ face_templates (vector 1024, scope, TTL)
                                   └─1:N─ biometric_consents

stores ─1:N─ devices (auth_uid = anonymous kiosk user)
   │             └─1:N─ device_pairing_codes
   ├─1:N─ staff
   ├─1:N─ transactions ─1:N─ payment_events (webhook_id unique)
   ├─1:N─ onboarding_sessions ─0:1─ transactions
   └─1:N─ legal_documents (per store; merchant is the data controller)
```

Key choices: integer cents; `vector(1024)` + HNSW cosine; no images; `scope` (`global` | `store`) and
`expires_at` on templates; expiry **disabled by default** (a store may enable a 365-day re-link, shorter
on request); `phone_e164` is unverified; `payment_events.webhook_id` unique; RLS on every table.

## 6. Endpoints (specs: `docs/04-api.md`)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/payments/checkout` | device | Create the local transaction |
| POST | `/face/identify` | device | Match embedding, return masked candidate |
| POST | `/face/enroll` | customer | Store template (consent required) |
| POST | `/payments/push` | device | `POST /codi/pn` |
| POST | `/payments/qr` | device | `POST /codi/qr` → `qrString` |
| GET | `/payments/{id}` | device \| customer | Status + reconcile |
| POST | `/payments/{id}/cancel` | device | Local cancel |
| POST | `/onboarding/sessions` | device | Create the QR token |
| GET | `/onboarding/sessions/{token}` | public | Session landing data |
| POST | `/onboarding/sessions/{token}/claim` | customer | Bind session to the phone |
| POST | `/onboarding/sessions/{token}/pay` | customer | Register-then-pay |
| POST | `/devices/claim` | anon | Pair a kiosk |
| POST | `/webhooks/pey` | signature | All pey events |
| POST | `/internal/reconcile` | cron secret | Poll pending transactions |

---

## 7. Phases

Status: **Phase A in progress** (everything real except the payment call). Earlier phases 0–4 are done
and absorbed into it. Check `MEMOIRS.md` for the current state.

| Phase | Deliverable | Acceptance |
| --- | --- | --- |
| **0** | Docs, scaffold, bilingual plan, `netlify.toml`, `.env.example` | approved; `package.json` valid |
| **1** | Monorepo, Next.js, Tailwind v4, shadcn, light/dark/auto, legal pages, Netlify preview, **mock adapter** | every screen navigable with fixtures, `MOCK_MODE=1`, zero network calls; deploy preview green |
| **2** | Migrations (all tables, enums, indexes), RLS, helper functions, seed | `db reset` clean; 3-identity RLS tests |
| **3** | Customer anonymous session, consent capture, `/mi-cuenta`, deletion | consent row has doc version + hash; delete purges templates |
| **4** | `face-engine`: camera, quality gates, liveness (incl. hand challenge), embedding, **calibration spike** | FAR/FRR report + go/no-go |
| **5** | Enrollment on the phone | template stored, scoped, revocable |
| **6** | Kiosk pairing + checkout screen | cross-store reads blocked |
| **7** | Identify + confirm | 10/10 own faces, 0 false matches on 20 people |
| **8** | Push + waiting screen (Realtime) | $0.01 end-to-end with a real bank app |
| **9** | Webhook + receipt + idempotency + late payment | replayed webhook is a no-op |
| **10** | CoDi QR, onboarding-session QR, pay-by-phone, every failure branch | each branch reachable and explained in Spanish |
| **11** | Hardening: rate limits, audit, reconciliation cron, a11y, kiosk mode | 30-min soak + forced-failure drills |
| **12** | Android evaluation (doc only) + kiosk-vector handoff design | decision, not code |

Every phase ends with a `MEMOIRS.md` entry, green `lint/typecheck/test`, and the demo script from
`docs/12-testing.md`.

---

## 8. Open questions

Answered in v0.2 (`MEMOIRS.md`, 2026-11-14 rev3): brand (FacePay MX), stack (React/Next web app; the
tablet is just the browser host), Supabase region (`us-east-1`), template expiry (off by default,
yearly re-link optional per store), scope default (global), data controller (FacePay MX as placeholder
until the merchant entity exists), receipt (screen only for MVP), concept (free text, optional, falls
back to the store name), git (init + commit, owner pushes), no payment tests until the owner asks.

Still open, and **blocking real enrollment rather than Phase 1**:

1. **Legal entity, RFC, address, privacy mailbox and ARCO channel** — placeholders are in the aviso
   template (`docs/07` §6.1). You must supply these before a real customer signs up.
2. **Counsel sign-off** on the aviso, the biometric consent and the 1:N search of walk-ins (R29). This
   is the only item that can stop the pilot on legal grounds.
3. **Counsel opinion** on whether walk-in identification needs a broader notice or a different legal
   basis.
4. **Pey account** — profile + CoDi payment account (up to 5 business days to activate) and the
   decision to run the $0.01 tests yourself, not by the agent.
5. **Target tablet model** — only needed to calibrate Phase 4; Chrome on Android is the assumption.
6. **Store name/logo** for the kiosk idle screen and receipts.

## 9. Non-goals (MVP)

Cards, Apple/Google Pay, payment links, refunds, tipping, split payments, cash drawer, inventory, CFDI
invoices, offline payments, merchant self-signup, Android app, certified liveness, analytics, i18n
beyond es-MX, accessible-certification, SMS/OTP, customer passwords.

**Explicitly deferred features (not "never", just not now):** receipt delivery by WhatsApp/SMS/email,
template-expiry notifications, kiosk→phone embedding handoff, payment links/cards, Android app,
customer-facing purchase history, tipping.

## 10. Outstanding security & privacy (post-MVP, written down on purpose)

These are **not** solved in the MVP. They are tracked here and in `docs/07-security-privacy.md` §9 so
nobody mistakes the demonstrator for a production system.

### 10.1 Processing of non-registered visitors
Every unknown customer is embedded and searched. That is biometric processing of someone who has not
consented. Mitigations in the MVP: visible notice at the camera, embeddings discarded after the
lookup (never persisted), only aggregate scores in `face_identifications`, no images. **Open:** a DPIA
and counsel sign-off on the legal basis for 1:N search of walk-in customers.

### 10.2 Unverified phone numbers
No OTP. A number is a claim until a push is paid. **Open:** SMS/WhatsApp OTP or "auth by paid push".

### 10.3 Browser liveness is beatable
Photo, replay, mask, deepfake, virtual camera. Bounded by the $300 cap, the confirm screen, rate
limits, and the fact that the bank authorizes. **Open:** certified SDK or native + Play Integrity.

### 10.4 Template lifecycle
TTL + re-confirm + scope exist in the schema; the re-confirm flow is Phase 12. **Open:** customer
notification before expiry (needs a channel we do not have).

### 10.5 Account recovery and ARCO without an account
An anonymous session lost with the phone means no self-service deletion. **Open:** a support channel,
or a face-assisted recovery that does not become face-based authentication.

### 10.6 Data residency and processors
Supabase region, SMS provider (none yet), pey. **Open:** confirm with counsel whether a transfer
notice is required.

### 10.7 What we must never claim
No "biometric authentication", no "certified liveness", no "PCI-compliant", no "your face protects
your money". The UI says the opposite, and the docs say why.

---

## 11. Definition of done for the demonstrator

- A returning customer pays in under 20 s with no cashier help.
- A newcomer signs up on their own phone and pays, without the kiosk storing or sending their face.
- A person who refuses biometrics pays with the CoDi QR in two taps.
- Killing the network mid-flow, replaying a webhook, and double-tapping "cobrar" all leave the DB
  correct.
- Every screen states that the bank authorizes the payment.
- `MEMOIRS.md` explains every deviation from this plan.
