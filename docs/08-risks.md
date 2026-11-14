# 08 — Risk register

Scoring: **P** = probability (1–5), **I** = impact (1–5), **Score** = P×I.
Severity: ≤4 low · 5–9 medium · 10–14 high · ≥15 critical.
"Blocks pilot" means we do not take real customer money until it is closed or explicitly accepted.

## Product / adoption

| ID | Risk | P | I | Score | Mitigation | Owner | Blocks pilot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | **CoDi adoption is low**; many customers can't pay by push | 4 | 4 | 16 | CoDi QR from day one (no card fallback in scope); measure successful pushes per 100 visits; never sell "face or nothing" | product | Yes (measurement) |
| R02 | Customer's bank doesn't show the PN / delays it | 3 | 3 | 9 | 6-min countdown, "ya pagué" reconcile, QR fallback, copy "algunos bancos tardan" | product | No |
| R03 | Line slows down because registration takes minutes | 4 | 3 | 12 | "Pay now, register later" path; registration only on the phone; QR CoDi in one tap | product | No |
| R04 | Face identification fails in real store lighting | 3 | 3 | 9 | quality gates + hints, 2 retries, calibration in Phase 4, fallback always visible | eng | No |
| R05 | Trust: customers think we store photos | 3 | 3 | 9 | no-image claim on screen, `BiometricFingerprint`, privacy page, deletion in 2 taps | product | No |

## Security / privacy

| ID | Risk | P | I | Score | Mitigation | Owner | Blocks pilot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R06 | **Liveness spoofed** (screen replay / deepfake) → wrong person billed | 3 | 2 | 6 | challenge + antispoof + confirm screen + $300 pilot cap + rate limits; native/certified liveness in production | eng | No (capped) |
| R07 | **Unlawful biometric processing** (missing/invalid consent, wrong responsable) | 2 | 5 | 10 | per-store aviso, separate consent, version+hash evidence, counsel review, DPIA | legal | **Yes** |
| R08 | **Template + phone database leak** | 2 | 5 | 10 | no images, RLS, no client access to embeddings, encryption at rest, least privilege, incident runbook | eng | **Yes** (controls must exist) |
| R09 | Push-request harassment by a merchant/cashier | 3 | 3 | 9 | 3/10 min per customer, per-customer block, audit, complaint channel | eng + ops | No |
| R10 | Device token stolen from a kiosk | 2 | 3 | 6 | short-lived anon session, revoke, per-store RLS, cap | eng | No |
| R11 | Phone number typo / wrong person receives push | 3 | 2 | 6 | confirmation screen with masked number; editable number; `no soy yo`; the wrong person simply declines | eng | No |
| R12 | A claimed number that is not yours receives requests | 3 | 3 | 9 | no OTP in MVP; number is unverified; the push must be paid by the bank's own holder; per-customer push rate limit; copy makes the merchant name and amount explicit | product | No |
| R13 | Minors enrolled | 3 | 3 | 9 | 18+ gate at consent; deletion flow | product | No |
| R14 | Data exported/shared beyond purpose | 2 | 4 | 8 | no export endpoint in MVP; admin export behind staff role + audit | eng | No |

## Payments / operations

| ID | Risk | P | I | Score | Mitigation | Owner | Blocks pilot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R15 | **No pey sandbox** → tests move real money | 5 | 2 | 10 | $0.01 only, separate test key, budget cap, docs/12 checklist, never in CI | eng | No |
| R16 | Webhook lost → payment not recorded | 3 | 4 | 12 | reconciliation cron (2 min) + hourly sweep + orphan alerts | eng | **Yes** |
| R17 | Late payment after local cancel | 3 | 2 | 6 | webhook wins, `late_payment=true`, cashier banner | eng | No |
| R18 | Duplicate charge / double receipt | 2 | 4 | 8 | `idempotency_key`, `webhook_id` unique, no re-send while awaiting | eng | No |
| R19 | Amount mismatch (fee/tip included in webhook) | 2 | 3 | 6 | store both, `amount_mismatch`, manual review, never auto-accept | eng | No |
| R20 | Bank account not activated (5 business days) | 4 | 3 | 12 | start registration on day 1; use the documented testing CLABE meanwhile | ops | **Yes** (timing) |
| R21 | pey API outage / 503 | 3 | 3 | 9 | mapped error, QR/link fallback, status page check | eng | No |
| R22 | Merchant account misconfigured (`bankAccountId`) | 2 | 4 | 8 | pin `bankAccountId` per store, alert on config errors | ops | No |

## Delivery / technical

| ID | Risk | P | I | Score | Mitigation | Owner | Blocks pilot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R23 | Web liveness can't reach the accuracy bar | 3 | 3 | 9 | calibrate in Phase 4; if FAR > 1 % at usable FRR, switch to ArcFace or commercial SDK | eng | No (but gates Phase 12) |
| R24 | Model size / cold start hurts the demo | 3 | 2 | 6 | lazy load + service worker pre-warm during pairing; 14 MB budget enforced | eng | No |
| R25 | iPad Safari WASM/WebGL differences | 3 | 2 | 6 | verify on the actual device in Phase 4; Chrome Android is the recommended kiosk | eng | No |
| R26 | Monorepo build/deploy drift on Netlify | 2 | 3 | 6 | `netlify.toml` with `base`, CI build on every PR | eng | No |
| R27 | Scope creep (refunds, tipping, inventory) | 4 | 3 | 12 | non-goals list in PLAN §9; new scope = new phase + ADR | product | No |
| R28 | Bilingual docs drift from reality | 3 | 2 | 6 | `PLAN.md` and `PLAN.es.md` change in the same commit; MEMOIRS entry per phase | eng | No |
| R29 | **1:N search of non-registered visitors** = biometric processing without consent | 4 | 4 | 16 | camera notice, embedding discarded after lookup, no images, aggregate audit only; DPIA + counsel opinion required | legal + eng | **Yes** |
| R30 | No account recovery / self-service ARCO if the phone is lost | 3 | 3 | 9 | document a support channel; deletion job available to ops; recovery design in Phase 12 | ops | No |

## Accepted risks (explicit, with the reasoning)

1. **Browser liveness is beatable.** Accepted for a demonstrator at ≤ $300 MXN per transaction. The
   loss is bounded by the bank approval. Revisit before any paid pilot.
2. **Global matching across stores by default.** Better UX (register once), but a template travels to
   every merchant. Mitigated by `store_id` scoping and by never showing full identity. Flagged to
   counsel.
3. **No sandbox testing.** Accepted; budget $5–10 of $0.01 transactions.
4. **Unverified phone numbers.** Accepted for the MVP: no OTP provider. The number is a claim, and only
   a paid CoDi push proves control. Revisit before charging real customers at scale.
5. **Kiosk is physically accessible.** Accepted with device revocation, caps, and audit.

## Review cadence

Re-score at the end of every phase; add a row for every incident. A risk that reaches ≥ 15 must be
escalated to the product owner before the next phase starts.
