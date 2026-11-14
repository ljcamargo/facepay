# 12 — Testing & demo scripts

## 1. Automated (every PR)

| Suite | What it proves | Command |
| --- | --- | --- |
| Lint / types | no `any` leaks, no unused secrets imports | `bun run lint && bun run typecheck` |
| Unit (pure logic) | money conversion, phone normalization, `numRef`, decision thresholds, concept sanitizing | `bun run test` |
| Schema | migrations apply clean from zero | `supabase db reset` |
| RLS | anon can't read anything; device A can't read store B; customer can't read another customer; no one can `select embedding` | `bun run test:rls` (runs `supabase/tests/rls.sql` as 3 identities) |
| Webhook | valid signature accepted; stale/invalid rejected; duplicate is a no-op; paid transition; late payment | `bun run test:webhook` (fixtures, no network) |
| Build | no `service_role` / `PEY_` string in the client bundle | `bun run build && bun run check:secrets` |
| A11y smoke | axe on kiosk + onboarding routes | `bun run test:a11y` |

CI never calls pey. Ever. The provider calls are mocked with recorded payloads.

## 1.5 Phase 2 — database smoke test (no Docker)

Phase 2 is backend only, so there are three ways to verify it. All are read-only.

### A. Run the RLS contract yourself

```bash
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<PW>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
bun run test:rls:remote     # expects: 12 assertions, 0 failures
```

(`bunx supabase test db --remote` also works but shells out to Docker for `pg_prove`.)

### B. Paste `supabase/tests/smoke-phase2.sql` into the SQL Editor

Expected results, in order:

| # | Check | Expected |
| --- | --- | --- |
| 1 | inventory | 14 tables · 1 view · 8 migrations · 1 store |
| 2 | seed | `Café Centro`, `pilot_limit_cents = 30000`, expiry off, face on |
| 3 | RLS | 14 / 14 tables with RLS |
| 4 | no-policy tables | `face_templates`, `payment_events`, `rate_limits` |
| 5 | grants | anon ✗ · authenticated ✗ on templates, ✓ on the metadata view |
| 6 | `identify_customer` | one row, `decision = no_match` |
| 7 | index | `face_templates_embedding_idx … USING hnsw … WHERE revoked_at IS NULL` |
| 8 | policies | device, customer and staff policies only |

### C. Prove it from outside, with the anon key

```bash
export SUPA=https://<ref>.supabase.co
export ANON=<NEXT_PUBLIC_SUPABASE_ANON_KEY>

# anon cannot read operational tables
curl -s "$SUPA/rest/v1/transactions?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# {"code":"42501","message":"permission denied for table transactions"}

curl -s "$SUPA/rest/v1/face_templates?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# {"code":"42501",...}

# published legal text only — nothing is published yet, so an empty array
curl -s "$SUPA/rest/v1/legal_documents?select=slug" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# []
```

The anon key is public by design; the 42501 responses are the RLS contract doing its job.

### What is NOT testable yet

No UI is wired to the database (Phase 3), no Edge Function exists (Phases 6–9) and no pey call is
made (Phase 8). The kiosk still runs on fixtures with `NEXT_PUBLIC_MOCK_MODE=true`.

## 2. Manual, per-phase acceptance

| Phase | Script | Pass criteria |
| --- | --- | --- |
| 1 | open `/`, `/legal/*` in light/dark/auto; walk the full flow with `MOCK_MODE=1` | renders, no layout shift, theme persists; every screen reachable with fixtures and zero network requests (DevTools) |
| 2 | `db reset`, then run the RLS suite by hand | 0 rows for anon, correct scoping |
| 3 | sign up on a real phone | anonymous session created, consent row has doc version + hash, no SMS is sent |
| 4 | 30 captures in store lighting | ≥ 90 % quality pass, decision ≤ 3 s, no frame leaves the device (DevTools network tab) |
| 5 | enroll, revoke, re-enroll | template soft-deleted, count returns to 0, re-enroll works |
| 6 | pair a fresh tablet | pairing code expires after 10 min; wrong code 5× locks |
| 7 | 10 attempts of your own face + 20 strangers | 9/10 self matches, 0 false matches, every failure gives a Spanish hint |
| 8 | $0.01 PN to your own cell | push arrives, approve, waiting screen flips in ≤ 2 s |
| 9 | replay the webhook 3× | one `paid` row, one receipt, 200 each time |
| 10 | every fallback path | QR CoDi pays; registration QR completes; pay-by-phone works; no phone-based retro-linkage exists |
| 11 | 30-min soak + forced failures | no memory growth, no stuck states, reconciliation recovers a lost webhook |

## 3. The 10-minute demo script (investor / stakeholder)

1. Fresh tablet → `/kiosk/setup` → pair with a code from the admin phone. **(30 s)**
2. Enter `$80.00`, concept "Pedido #123" → "Cobrar con rostro". **(15 s)**
3. Look at the camera, complete the blink challenge. Show the ephemeral vector bars and say: *"esto
   vive en la memoria del navegador; nunca se envía"*. **(20 s)**
4. "¿Eres …?" → yes → push sent. Show the countdown. **(10 s)**
5. Open the bank app on the demo phone, approve. Tablet flips to the receipt. **(20 s)**
6. Tap "Nueva venta", then "Otros métodos" → CoDi QR. Scan with a second phone. **(60 s)**
7. Tap "Usar QR en su lugar" from the confirm screen to show the refusal path. **(20 s)**
8. Open `/legal/privacy` on the tablet, show the plain-language box + `BiometricFingerprint`. **(30 s)**
9. Say the honest sentence: *"El rostro elige a quién cobrarle. El dinero se autoriza en el banco."*

## 4. Forced-failure drills (run before any pilot)

| Drill | How | Expected |
| --- | --- | --- |
| pey down | point `PEY_API_BASE` at a mock returning 503 | Spanish error + QR path, no stuck spinner |
| webhook dead | disable the webhook URL in the portal, pay $0.01 | reconciliation marks it paid ≤ 5 min |
| duplicate push | tap "enviar" twice fast | one `pey_transaction_id`, one request |
| camera denied | block camera permission | fallback screen, no console crash |
| two faces | stand next to someone | inline hint, no request sent |
| revoked device | revoke in DB mid-flow | kiosk wipes state and shows pairing |
| wrong store | replay a device JWT against another store's tx | 403/404, no data |

## 4.5 Phase 4 — face engine on the real tablet

```bash
bun run models:sync        # ~23 MB, once
bun run dev:https          # camera needs HTTPS on any origin that is not localhost
```

`getUserMedia` is blocked on plain-HTTP LAN origins. `dev:https` serves a self-signed certificate;
accept the warning on the tablet once. Deploying a Netlify preview also works.

Open `/dev/face` (link at the bottom of Ajustes) on the tablet:

| Check | Pass criteria |
| --- | --- |
| Backend | `webgl` (not `cpu`) |
| FPS | ≥ 10 at 640×480 |
| Gates at 40–80 cm | all `ok` with normal store light |
| Each challenge | blink / turn / smile / approach satisfied within 4 s; hands needs 2 fingers |
| Capture | 1024 dims, hash shown, ≤ 400 ms |
| Two faces | `single_face` fails with the "más de una persona" hint |
| Hands off | hand signals stay 0 and challenges still work |

Then open `/dev/calibrate`, drop ≥ 10 people × 2 consented photos named `persona__*.jpg`:

| Check | Pass criteria |
| --- | --- |
| Report | EER and a recommended `t` are shown |
| Target | FAR ≤ 0.1 % with FRR ≤ 5 % |
| Action | paste the JSON into `docs/calibration/YYYY-MM-DD-<device>.md` and update the thresholds |

If the target is not reachable, stop and switch the engine (docs/06 §4.1) before Phase 5.

## 5. Calibration (Phase 4 and after any model change)

`scripts/calibrate.ts` reads a CSV of local image paths (never committed), computes embeddings, and
prints FAR/FRR at a threshold sweep plus the recommended operating point. Report goes to
`docs/calibration/YYYY-MM-DD-<device>.md` with the model version and the date. No images or
embeddings in the repo; only aggregate numbers.

## 6. Money spent on tests

Track in `MEMOIRS.md`: date, count, amount. Budget: **$10 USD** of $0.01 transactions for the whole
MVP. If a test needs more, it needs a written reason.
