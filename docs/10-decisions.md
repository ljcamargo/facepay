# 10 — Decisions (ADRs)

Format: context → decision → consequences. Status: `accepted` unless noted.
A new decision that changes behavior requires a new ADR; do not rewrite history.

---

## ADR-001 — pey calls and the webhook live in Supabase Edge Functions

**Context:** The Next.js app runs on Netlify. pey requires a bearer key and a signed webhook. A future
Android client will need the same operations.

**Decision:** All pey traffic and the webhook handler are Deno Edge Functions in `supabase/functions`.
The web app only talks to Supabase (postgrest, auth, realtime, functions).

**Consequences:** one place for secrets; webhook survives frontend deploys; no second backend to write
for Android. Costs: a second runtime, Deno-only libraries, and local functions need the Supabase CLI.

---

## ADR-002 — Face is identification, never authentication

**Context:** Biometric login is a common product idea and a common way to lose money.

**Decision:** The face only selects which verified phone number receives a CoDi push. Authorization
always happens in the customer's banking app. No code path may grant access, unlock a device, or move
money on a face match alone.

**Consequences:** spoofing has bounded financial impact (a payment request the victim declines);
privacy impact remains and is handled separately. The product cannot claim "pay with your face" as a
security feature. It can claim "pay without your wallet". Since v0.2 this is **stated in the UI**, not
only here: every kiosk screen carries "El rostro solo identifica. El pago lo autorizas en tu banco.".

---

## ADR-003 — Customer account lives on the customer's phone, not at the kiosk

**Context:** No email is desired; Supabase has no face factor; the kiosk must not hold customer
credentials.

**Decision:** A customer account is created only during signup, on the customer's own phone, as an
**anonymous Supabase session**. The kiosk never authenticates the customer and never creates accounts.
Registration is only reachable through the onboarding QR or the "pay with my phone" page.

**Consequences:** no password, no email, no credentials on a shared tablet. Account recovery becomes
the weak point (ADR-014) and is listed as outstanding work in `PLAN.md` §10.5.

## ADR-004 — Enrollment selfie is captured on the customer's phone

**Context:** The kiosk camera is convenient but capturing there allows binding a bystander's face to a
number, and captures the face before consent is shown.

**Decision:** Registration QR → customer's phone → number + consent → selfie with the same liveness
challenge → template stored. Kiosk-side enrollment is out of scope (ADR-016).

**Consequences:** the face↔phone binding is trustworthy (both happen in the same session, after
consent). Slightly higher friction at first registration; irrelevant for return visits.

**v0.2 note:** confirmed. The "kiosk sends its embedding to the phone" optimization is explicitly
post-MVP (`PLAN.md` §3.2): it needs consent-before-capture ordering and a phone confirm-frame, and it
buys ~8 seconds. We do not build it now.

---

## ADR-005 — `@vladmandic/human` for the MVP face engine

**Context:** Need detection, 1024-d embeddings, liveness/antispoof, and hands in one package, running in
a browser, MIT-licensed.

**Decision:** Use `@vladmandic/human` behind a `packages/face-engine` interface
(`detect/quality/liveness/embed`). MediaPipe Tasks + ArcFace ONNX is the documented upgrade; a
commercial SDK is the production option.

**Consequences:** fast to build; ~14 MB of self-hosted models; accuracy below ArcFace. The interface
keeps a swap cheap. Embeddings are model-versioned; changing models invalidates stored templates.

---

## ADR-006 — No raw images, ever (MVP)

**Context:** Face images are the worst thing to leak and the first thing a lawyer asks about.

**Decision:** Only unit-normalized numeric templates are stored. Frames stay in browser memory and are
discarded. No images in Postgres, Storage, logs, or error reports.

**Consequences:** no visual evidence for disputes; the "no soy yo" report is a flag, not a photo. Any
future need for a thumbnail requires a new ADR with encryption, ≤72 h TTL, separate consent, and
counsel review.

---

## ADR-007 — Money in cents, `numRef` from a daily counter, webhook join by metadata

**Context:** Floats lose cents; pey's `numRef` is ≤ 7 digits and Banxico uses it as a reference.

**Decision:** `amount_cents integer` everywhere; convert to a number only in the pey client. `numRef`
= zero-padded per-store daily sequence. The webhook joins on `transactionId`, falling back to
`metadata.txId`.

**Consequences:** exact arithmetic; `numRef` collisions across stores are irrelevant (one account per
key) and are still logged.

---

## ADR-008 — CoDi only: three CoDi paths, no cards

**Context:** CoDi push coverage is partial and part of the audience will refuse biometrics. Cards and
payment links would widen reach but drag in Stripe onboarding and a second settlement flow.

**Decision:** only CoDi, through pey. Three paths: **A** face → push, **B** CoDi QR on the tablet,
**C** customer types their number on their own phone → push. No cards, no Apple/Google Pay, no payment
links in the MVP. The face "replaces scanning the QR"; it is not a new payment method.

**Consequences:** the product is only usable by customers with CoDi active at their bank — a hard
ceiling we state openly instead of hiding. Every failure screen offers the CoDi QR. Removing path D
also removes the `payment_link` transaction method and Stripe from all docs and code.

## ADR-009 — RLS + `security definer` RPCs instead of a custom API layer

**Context:** Supabase exposes PostgREST directly. A custom API for every read is boilerplate.

**Decision:** RLS on every table; direct reads only for the customer's own rows and published legal
docs. Anything that touches embeddings, money, or the webhook goes through an Edge Function or a
`security definer` RPC with a pinned `search_path`.

**Consequences:** less server code; RLS correctness becomes critical → dedicated RLS test suite run
from three identities (anon, device, customer).

---

## ADR-010 — Kiosk auth = anonymous Supabase user + pairing code

**Context:** Tablets are shared devices; storing a staff password on them is unacceptable.

**Decision:** The kiosk signs in anonymously, then claims a short-lived pairing code generated by staff.
`devices.auth_uid` binds the session to a store. Heartbeat + revocation wipe the local state.

**Consequences:** no shared credential, easy revocation, per-store RLS. Anonymous users are real auth
users (they count toward MAU); acceptable at this scale.

---

## ADR-011 — Realtime for the waiting screen, polling as fallback

**Context:** The webhook can land while the customer is still looking at their phone.

**Decision:** Subscribe to `postgres_changes` on `transactions` (RLS-scoped). Fall back to 2 s polling
and a manual refresh button.

**Consequences:** near-instant receipt; three code paths converge on one status endpoint, so a Realtime
outage degrades instead of breaking.

---

## ADR-012 — Multi-tenant schema from day one, single-tenant UX

**Context:** The pilot is one store, but a second store is likely and retrofitting `store_id` into
RLS later is painful.

**Decision:** Every operational row carries `store_id`; RLS enforces it; the UI shows one store per
kiosk. Global face matching by default, with `face_templates.store_id` available for scoping.

**Consequences:** a bit more schema and policy work now; no migration cliff later. Cross-store template
sharing is a privacy question flagged to counsel.

---

## ADR-013 — Spanish UI, English code and docs

**Context:** Operators and customers are Spanish-speaking; the team and future contributors are not
necessarily.

**Decision:** All UI strings in `packages/shared/src/i18n/es.ts`, typed. Code identifiers, schema,
comments, commit messages, and docs in English. `README.es.md` and `docs/07` summary in Spanish where
it matters legally.

**Consequences:** no hardcoded strings; copy changes are a single-file diff; legal text stays reviewable
by a Mexican lawyer even if the surrounding docs are English.

---

## ADR-014 — No OTP in the MVP; the phone number is a claim, not a verified attribute

**Context:** pey has no OTP/SMS endpoint (confirmed against its OpenAPI spec). An SMS provider means
cost, MX deliverability problems, and another dependency for a demonstrator.

**Decision:** signup creates an anonymous Supabase session on the customer's phone. `phone_e164` is
stored with `phone_verified_at = null` and is never treated as verified. The only proof of phone
control is a **paid CoDi push**. We cut "link past purchases by phone number" from the MVP.

**Consequences:** zero messaging cost and no provider. Residual risk: a number can be claimed, so a
stranger's face can be bound to the claimant's number (harassment, not theft — the bank still
authorizes). Documented as R09/R12 and accepted for the demonstrator with a $300 cap. Future options:
Supabase Send SMS Hook (SMS/WhatsApp), "auth by paid push" ($0.01 request that proves control), or
passkeys.

---

## ADR-015 — Template scope and expiry are first-class

**Context:** arbitrary stores share one database; customers may distrust a global biometric.

**Decision:** `face_templates.scope` = `global` (default) | `store` (matched only by that store's
kiosks), plus `last_used_at` and `expires_at`. **Expiry is off by default**: a store opts in with
`template_expiry_enabled`, which brings a **365-day** window (`template_ttl_days`, shorter on request)
with three tiers: normal → re-confirm (same 2-second capture) → full re-enrollment after 2×TTL.
`scope` is offered to the customer at enrollment.

**Consequences:** privacy choice without a database per store. Re-confirm needs a flow (Phase 12) and,
ideally, a notification channel we do not have yet (outstanding, `PLAN.md` §10.4). No store is forced
to expire anything: deleting a template is always the customer's right, never an automatic surprise.

---

## ADR-016 — The kiosk identifies, it never registers

**Context:** v0.1 sketched registration reachable from the kiosk. Capturing an enrollment face there
would process a face before the privacy notice was shown and would let anyone bind a bystander's face
to their own number.

**Decision:** when a face is unknown, the kiosk only shows a QR to `https://app/onboarding/<token>`.
Signup (notice, consent, selfie, liveness, template) happens entirely on the customer's device. The
kiosk's identification capture is transient, never persisted, and never forwarded in the MVP.

**Consequences:** the kiosk stays a thin terminal; consent ordering is provable; the face↔phone binding
is created on the device that owns the number. Cost: ~25 s of customer-side friction, mitigated by the
CoDi QR fallback so the line never stops.

---

---

## ADR-017 — Passive capture by default; no challenges in the customer path

**Context:** the first sketch asked the customer to blink, turn, smile or show fingers. That is the only
anti-replay property available in a browser, but it costs 3–5 seconds per customer and makes a retail
queue worse. It also protects something we deliberately do not rely on: the face does not authorize
money (ADR-002).

**Decision:** the production path is **camera → quality gates → passive liveness score → match**, with
no instruction beyond "look at the camera, hold still one second". The challenge state machine stays in
`packages/face-engine`, used by `/dev/face` and available per store behind a flag for merchants who want
it. Liveness scores are recorded in `face_identifications`, not enforced in the MVP.

**Consequences:** ~1–2 s per identification instead of ~6 s, and no choreography to explain at the
counter. A photo held up to the camera can still pass; the blast radius is a request the real person
declines, exactly as before. If a store later needs anti-replay, it turns the flag on and pays the
seconds.
