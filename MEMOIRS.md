# MEMOIRS.md — engineering bitácora

Append-only log of what changed, why, and what is still wrong. Newest entry on top.
Rules: never delete or rewrite an entry (correct it with a later entry). Keep it short, factual,
and useful to someone who joins in three months. One entry per phase or per significant decision.

Entry template:

```md
## YYYY-MM-DD — <phase/scope> — <author: human | agent name>
**Intent:** why this work happened.
**Changed:** files/areas, in plain language.
**Decisions:** ADR-00X if any (and whether it supersedes something).
**Verified:** exact commands + result (or "not verified, because…").
**Deviations:** where reality diverged from PLAN.md.
**Known issues / traps:** what will bite the next person.
**Next:** the single most important follow-up.
```

---

## 2026-11-14 — Phase 0 rev3: decisions locked, mock-first, commit — human + agent
**Intent:** close the open questions so the plan stops moving, and make the first committed artifact
the docs (not code).

**Decided by the owner:** brand FacePay MX; stack stays the React/Next web app, "Android Chrome" only
names the store tablet's browser; Supabase `us-east-1`; **template expiry off by default** with an
opt-in yearly re-link (shorter optional); scope default `global`; FacePay MX as data-controller
placeholder until the merchant entity exists; receipt screen-only for the MVP (delivery deferred);
concept free text, optional, falls back to the store name; `git init` + commit, owner pushes; **no
payment tests run by the agent** until the owner asks.

**Changed:**
- Phase 1 now includes a **mock adapter** (`MOCK_MODE=1`): every screen navigable with fixtures and
  zero network calls, so the UI can be reviewed before any Supabase or pey account exists.
- `stores.template_expiry_enabled` (false) + `template_ttl_days` 365; `transactions.concept` has no
  default and the server fills the store name. ADR-015 amended.
- `PLAN.md` §8 reduced to six open items, all blocking *real enrollment*, not Phase 1.
- `docs/07` §6.1 added: the exact placeholders (`{{LEGAL_NAME}}`, `{{RFC}}`, `{{ADDRESS}}`,
  `{{PRIVACY_EMAIL}}`, `{{ARCO_URL}}`, `{{SHOP_NAME}}`…) and a rule that a published legal doc may not
  contain `{{…}}`.
- `docs/06` §10 added: model licensing. `@vladmandic/human` is MIT; FaceRes is **Apache-2.0**,
  MobileFace **MIT**, MediaPipe models **Apache-2.0**; the antispoof/liveness source is **not
  explicitly credited** — flagged as an action item before commercial use.
- `docs/12` gains the Phase 1 mock walkthrough.
- First commit created (docs + scaffold only).

**Verified:** `PLAN.md` and `PLAN.es.md` still have identical heading structure (29/29) and phase rows
(13/13). No code, no migrations, no pey calls, no accounts created.

**Known issues / traps:**
- Mock mode must not leak into production: the adapter is chosen by env at boot and the build fails if
  `MOCK_MODE=1` is set for a production deploy.
- The placeholder validator is a Phase 3 requirement; without it, an aviso with `{{…}}` could be
  published and accepted.
- Model licences are inherited, not relicensed by Human. The liveness/antispoof file is the open one.

**Next:** owner reviews and pushes this commit. Then Phase 1 (scaffold + mock UI) once approved.

## 2026-11-14 — Phase 0 rev2: CoDi only, no OTP, kiosk never registers — human + agent
**Intent:** the first plan assumed cards as a safety net, SMS OTP for signup, and registration
reachable from the kiosk. All three were wrong for this scope. Tighten the plan before any code.

**Changed (docs only, no application code):**
- `PLAN.md` rewritten as **v0.2**; `PLAN.es.md` added as a synced Spanish mirror.
  `AGENTS.md` now requires both to change in the same commit.
- Scope is **CoDi only**: payment links / cards / Stripe removed from `PLAN`, `docs/02`, `docs/04`
  (§8 is now "removed"), `docs/08`, and both READMEs. `tx_method` has no `payment_link` value.
- **No SMS/OTP in the MVP.** pey has no OTP endpoint (verified against `docs.pey.mx/openapi.json`),
  so the phone is an unverified claim. New ADR-014; ADR-003 superseded.
- **The kiosk never registers.** New ADR-016: unknown face → QR → signup on the customer's device.
  The kiosk-vector handoff is a documented post-MVP optimization, not built.
- **Template scope + TTL** (ADR-015): `scope` global|store, `last_used_at`, `expires_at`,
  `stores.template_ttl_days` (180), three tiers with a re-confirm step.
- Pilot guardrail lowered to **$300 MXN**; renamed `max_face_amount_cents` → `pilot_limit_cents` with
  an explicit note that it is a guardrail, not a security control.
- `docs/07` gained **§9 Outstanding (post-MVP)** and **§10 Anexo en español** for counsel.
  `docs/06` gained **§9 Processing of non-registered visitors** — the biggest unresolved exposure.
- Hand tracking added to the plan as an extra random liveness challenge (Human ships it, MIT).
- `package.json` fixed (my previous edit had left it invalid JSON).

**Decisions:** ADR-002 amended (the "bank authorizes" line now appears in the UI), ADR-003 superseded,
ADR-008 rewritten (CoDi only), ADR-014/015/016 added.

**Verified:** every doc mention of `payment-link`, `payment_link`, `$500`, OTP and "three payment
paths" was grepped and either removed or rewritten. `package.json` parses. No code, no migrations,
no network calls to pey.

**Deviations:** the confirm-frame enrollment (kiosk vector → phone) stays unimplemented; it is now
documented as an optimization with its two costs (consent ordering, replay edge cases).

**Known issues / traps:**
- The unverified phone breaks "link past purchases by number". Do not reintroduce it without OTP.
- 1:N search of walk-ins is biometric processing without consent. Signage + discard is a mitigation,
  not a legal basis. Blocking for a paid pilot (R29).
- A customer who loses their phone loses self-service deletion (R30).
- `PLAN.md`/`PLAN.es.md` are now a sync pair; edit both or the next agent will trust the stale one.

**Next:** answer `PLAN.md` §8 (brand, tablet, region, TTL, scope default, controller), then approve
Phase 1.

## 2026-11-14 — Phase 0: planning corpus — human + agent

**Intent:** Before any code, pin down what pey.mx actually does, how customers can be identified
without email, what the screens are, and what the data model must support — including the
"refuse biometrics" and "register later" paths.

**Changed:**
- Created the monorepo skeleton (dirs only, no app code): `apps/web`, `apps/android`,
  `packages/{shared,pey-client,face-engine}`, `supabase/{migrations,functions,seed}`, `scripts`.
- `README.md` + `README.es.md` (bilingual, planning status, hard warnings).
- `PLAN.md` — research findings, 4 payment paths, 4 flows, failure matrix, screen schematics,
  phases 0–12, open questions, non-goals.
- `docs/01…12` — architecture, pey integration, DB/DDL, API, UI + es-MX copy deck, face recognition,
  security/privacy, risks, runbook, ADRs, glossary, testing.
- `AGENTS.md` (collaboration contract), this file.
- `netlify.toml`, `.env.example`, `.gitignore`, root `package.json`, `pnpm-workspace.yaml`.

**Decisions (see `docs/10-decisions.md`):**
- ADR-001 `pey` calls + webhook live in **Supabase Edge Functions**, not Next.js routes.
- ADR-002 **Face identification, never authentication.** Money is authorized in the bank app.
- ADR-003 Customer auth = **phone OTP once**, at registration. Kiosk = anonymous auth + pairing.
- ADR-004 **Selfie is captured on the customer's phone**, not the tablet.
- ADR-005 Embeddings via `@vladmandic/human` (1024-d) behind a `face-engine` interface; ArcFace ONNX
  is the documented upgrade path.
- ADR-006 Store **no images**, ever, in the MVP.
- ADR-007 Money as integer cents; `numRef` 7 digits; webhook join via `metadata.txId`.
- ADR-008 Three payment paths from day one (face→PN, CoDi QR, manual PN); payment link optional.

**Verified:** pey.mx docs + OpenAPI spec (`https://docs.pey.mx/openapi.json`, version 2026-10-20)
read directly; amounts/limits/regexes copied from the spec, not from memory. Supabase Auth
capabilities (phone OTP incl. WhatsApp channel for Twilio, anonymous sign-ins, Send SMS Hook)
confirmed in current Supabase docs.

**Deviations:** none yet (no code). Note: pey's "Configure CoDi for testing" tutorial referenced in
their `llms.txt` returns 404 — the test-bank CLABE from "Create an API Key" is the fallback.

**Known issues / traps:**
- pey has **no sandbox**; every test is a real SPEI/CoDi event. Budget for this.
- CoDi push requires the payer's cell to be **enrolled at their bank**; coverage varies by bank.
- Webhooks: **one URL per API key**, so one endpoint must route all event types.
- No public cancellation for a PN; late approvals must be handled, not ignored.
- Browser liveness is beatable; treat the demonstrator as such.
- Bilingual docs drift fast. Any UI copy change must land in `docs/05-ui-screens.md` in the same PR.

**Next:** answer the 11 open questions in `PLAN.md` §8 (especially the pey account status and the
target tablet), then approve Phase 1.
