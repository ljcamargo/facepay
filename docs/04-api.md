# 04 — API (Supabase Edge Functions)

Base URL: `https://<project>.supabase.co/functions/v1`. Locally: `http://localhost:54321/functions/v1`.

Auth: Supabase JWT in `Authorization: Bearer <token>`. Three kinds of caller:

| Caller | Token | Resolved as |
| --- | --- | --- |
| Kiosk | anonymous user JWT | `devices.auth_uid` → `devices.store_id` |
| Customer phone | anonymous session created at signup | `customers.id = auth.uid()` |
| Cron | shared secret header | `service_role`, not public |

`verify_jwt = false` only for `webhooks-pey` (pey has no Supabase JWT); it verifies its own HMAC.

Response envelope: success `{ "data": … }`, error `{ "error": { "code": "…", "message": "…",
"requestId": "…" } }`. `message` is Spanish for anything a customer could see; `code` is stable
English for us. `requestId` = `crypto.randomUUID()` echoed in logs.

Common error codes: `UNAUTHORIZED`, `FORBIDDEN`, `DEVICE_NOT_PAIRED`, `VALIDATION`, `RATE_LIMITED`,
`PEY_UNAVAILABLE`, `PEY_REJECTED`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`.

---

## 1. `POST /payments/checkout` — device

Creates the local transaction that everything else hangs from.

```json
{ "amountCents": 8000, "concept": "Pedido #123", "idempotencyKey": "k7f3…" }
```
`concept` is **optional** (free text, ≤60 chars, trimmed, no `<>`); when empty the server stores the
store name, so the payer always sees something meaningful in their bank app.
Validation: `100 ≤ amountCents ≤ min(1_000_000_00, stores.pilot_limit_cents)`; `idempotencyKey`
uuid-ish 16–64 chars.

`201` → `{ "data": { "id": "uuid", "status": "created", "amountCents": 8000, "expiresAt": "…" } }`
Same `idempotencyKey` → `200` with the existing row (never a second charge attempt).

Side effects: inserts `transactions` with `status='created'`, `method` chosen later, `num_ref`
from the per-store daily counter, `expires_at = now() + 5 min` for the identification step.

## 2. `POST /face/identify` — device

```json
{
  "embedding": [0.013, -0.204, "… 1024 floats"],
  "model": "human-hse-faceres",
  "modelVersion": "3.3.6",
  "liveness": 0.93,
  "quality": 0.81,
  "transactionId": "uuid"
}
```
Server checks (in order):
1. device belongs to a store and is `active`; `transactionId` belongs to that store and is `created`;
2. `embedding.length === 1024` and all finite; `liveness ≥ 0.75`; `quality ≥ 0.6`
   (below → `low_quality`/`liveness_fail`, no matching performed);
3. rate limit: 20 identifications / device / 5 min, 5 / 60 s;
4. `select * from identify_customer(...)` with thresholds from `stores` (defaults 0.60 / 0.08).

`200` matched:
```json
{ "data": { "decision": "matched",
            "candidate": { "customerId": "uuid", "displayName": "Ana", "phoneMasked": "•••• 5678" },
            "similarity": 0.74, "margin": 0.11 } }
```
`200` not matched: `{ "data": { "decision": "no_match" | "ambiguous", "similarity": 0.41 } }`
`429` when rate-limited; `422` when quality/liveness fail.

Always writes `face_identifications` (decision, scores, latency, `transaction_id`) — including
failures. Never logs the embedding itself; only its dimension and a truncated SHA-256 for debugging.

## 3. `POST /face/enroll` — customer

```json
{ "embedding": [...], "model": "human-hse-faceres", "modelVersion": "3.3.6",
  "liveness": 0.91, "quality": 0.85, "consentId": "uuid", "storeId": "uuid|null",
  "scope": "global", "source": "phone_selfie" }
```
Guards: an unrevoked, `accepted = true` consent row for the current `privacy` + `biometric-consent`
document versions must exist for this customer (**the notice is shown before any capture**); max **3**
active templates; rate limit 3 enrollments / hour / customer; `liveness ≥ 0.75`.
`scope` defaults to `global`; `expires_at` is `null` unless the store enabled
`template_expiry_enabled` (then `now() + template_ttl_days`, default 365).
The phone number is stored as an unverified claim — no OTP exists in the MVP (`PLAN.md` §1.3).

`201` → `{ "data": { "templateId": "uuid", "activeTemplates": 1 } }`
`409` if the same embedding is within 0.02 cosine of an existing template of the **same** customer
(duplicate), or if the embedding matches a **different** customer above threshold → `FACE_ALREADY_LINKED`
(possible fraud or a family with shared devices; requires staff review).

The embedding is stored; the request body is **not** logged.

## 4. `POST /payments/push` — device

```json
{ "transactionId": "uuid", "customerId": "uuid" }
```
or for manual PN: `{ "transactionId": "uuid", "phone": "5512345678" }` (only if
`stores.allow_manual_phone_entry`).

Steps:
1. load transaction (must be `created`, same store), customer active and phone verified;
2. enforce `amount_cents ≤ max_face_amount_cents`; `expiration = 600`; `numRef` from the row;
3. compute `sha256(idempotency)`? no — the row is the idempotency unit: if `pey_transaction_id` is
   already set, return the current status instead of calling pey again;
4. call `POST /codi/pn` with `metadata: { txId, storeId }`;
5. store `pey_transaction_id`, `pey_codi_id`, set `status='awaiting_payment'`,
   `method='face_pn'|'manual_pn'`, `expires_at = now() + 600s`;
6. on pey error: map (`docs/02` §7), leave `status='created'` for 4xx (retryable by another method)
   or `failed` for config errors; return the mapped error.

`200` → `{ "data": { "transactionId": "uuid", "peyTransactionId": "01J…", "status": "awaiting_payment",
"expiresAt": "…" } }`

## 5. `POST /payments/qr` — device

```json
{ "transactionId": "uuid", "amountCents": 8000, "concept": "Pedido #123" }
```
Calls `POST /codi/qr` (`generateImage:false`), returns `qrString` for client-side rendering.
`200` → `{ "data": { "qrString": "{\"TYP\":1,…}", "peyQrId": "AB12…", "expiresAt": "…" } }`
Note: `pey_qr_id` is the Banxico IDC; the QR webhook arrives with `codiQrId` (same value) — reconcile
by `pey_qr_id` if `pey_transaction_id` is still null.

## 6. `GET /payments/{id}` — device or customer

Returns the safe view: id, status, amountCents, concept, method, createdAt, paidAt, expiresAt,
receiptNo, payerBankCode, payerClabeLast4. **No phone, no CLABE, no embeddings.**

If `status = awaiting_payment` and `now - created_at > 45 s`, the function also calls
`GET /transaction/{pey_transaction_id}` and, if `PAID`, performs the same transition as the webhook
(with `payment_events.provider = 'reconcile'`). This is what makes the manual "Ya pagué, actualizar"
button honest.

## 7. `POST /payments/{id}/cancel` — device

Allowed from `created` / `awaiting_payment`. Sets `status='cancelled'`. If a PN was already sent, the
response includes `"warning": "push_cannot_be_recalled"` — the customer may still approve; the
webhook will flip it to `paid` with `late_payment = true`.

## 8. Payment links — removed

**Removed in v0.2.** Scope is CoDi only: no cards, no Apple/Google Pay, no hosted payment link, no
Stripe. `public.tx_method` therefore has no `payment_link` value. If the scope reopens, this is the
endpoint that comes back first (`POST /payment-link/create`, HTTPS `successUrl`/`backUrl`, webhook
`payment_link.status_updated`).

## 9. Onboarding

### `POST /onboarding/sessions` — device
```json
{ "amountCents": 8000, "concept": "Pedido #123" }
```
Creates the row, returns the URL (token is returned **once**, only its SHA-256 is stored):
```json
{ "data": { "sessionId": "uuid", "url": "https://app.example/onboarding/eyJ…", "expiresAt": "…" } }
```
TTL 15 min, single use. Tablet reuses an open session for the same amount instead of creating new ones.

### `GET /onboarding/sessions/{token}` — public (rate-limited)
Returns `{ storeName, amountCents, concept, status, expiresAt }` — nothing else. This is what the
phone renders before login. Token is the secret; 404 for unknown/expired.

### `POST /onboarding/sessions/{token}/claim` — customer
Binds the session to `auth.uid()`, checks TTL/status, records `completed_customer_id`.
`409` if already claimed.

### `POST /onboarding/sessions/{token}/pay` — customer
Same as `/payments/push` but the transaction is created here from the session and linked both ways
(`transactions.onboarding_session_id`, `onboarding_sessions.created_transaction_id`). Only after
`claim` + consent + ≥1 template.

## 10. Devices

### `POST /devices/claim` — anonymous JWT
```json
{ "code": "482913", "label": "Caja 2", "appVersion": "0.4.1" }
```
Hashe, compare, check TTL (10 min) and `attempts < 5`, then set `devices.auth_uid = auth.uid()`,
`status='active'`, `paired_at`. `200` → `{ "data": { "deviceId": "uuid", "storeName": "…" } }`.
The kiosk then signs out of any previous session and reloads.

### `POST /devices/heartbeat` — device
Updates `last_seen_at`, `app_version`. Called every 60 s; also used to detect a revoked device
(`status != active` → `403 DEVICE_REVOKED` → kiosk wipes local state).

## 11. `POST /webhooks/pey` — signature

No JWT. See `docs/02` §5 for the exact algorithm. Contract:

- verify signature + 300 s freshness → else `401`;
- dedupe on `webhook-id` → duplicate returns `200 { "duplicate": true }`;
- unknown transaction → persist as `orphan`, `200` (do not make pey retry forever);
- any DB write failure → `500` (pey retries; dedupe keeps it safe);
- always `200` only after the state change is committed.

Verification (Deno, no dependencies):

```ts
const enc = new TextEncoder();
async function verifyWebhook(raw: string, h: Headers, secret: string) {
  const id = h.get("webhook-id"), ts = h.get("webhook-timestamp"), sig = h.get("webhook-signature");
  if (!id || !ts || !sig) return false;
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw", Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${raw}`)),
  );
  const expected = btoa(String.fromCharCode(...mac));
  // multiple space-separated "v1,<b64>" entries are allowed
  return sig.split(" ").some((part) => {
    const [v, b64] = part.split(",");
    if (v !== "v1" || b64?.length !== expected.length) return false;
    let diff = 0;                                  // constant-time compare
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ b64.charCodeAt(i);
    return diff === 0;
  });
}
```

## 12. `POST /internal/reconcile` — cron

Header `x-cron-secret: <CRON_SECRET>`; `401` otherwise. Body `{ "limit": 20 }`.
Selects `awaiting_payment` rows older than 60 s (and < 24 h), queries pey, applies transitions, prunes
expired rows (`status='expired'`), and sweeps `GET /transaction/api-key` for orphan payments once an
hour. Returns `{ checked, paid, expired, orphans }`. Idempotent; safe to run every 2 minutes.

## 13. Rate limits (MVP values)

| Endpoint | Limit |
| --- | --- |
| `/face/identify` | 20 / 5 min / device; 5 / 60 s |
| `/face/enroll` | 3 / hour / customer; 10 / day / customer |
| `/payments/push` | 3 / 10 min / customer; 30 / hour / device |
| `/onboarding/sessions` | 20 / hour / device |
| `/onboarding/sessions/{token}` (public) | 30 / 10 min / IP |
| `/devices/claim` | 5 attempts per code, 20 / hour / IP |
| `/webhooks/pey` | signature-gated; no app-level limit |

Implemented with a `rate_limits(key text, window_start timestamptz, count int)` table + an atomic
`check_rate_limit(p_key, p_limit, p_window_seconds)` function (insert … on conflict do update …
returning count). Postgres-based so it survives function cold starts and works across regions.

## 14. What the client is allowed to do directly (no Edge Function)

| Action | How | Why safe |
| --- | --- | --- |
| Anonymous sign-in (customer or kiosk) | `supabase.auth.signInAnonymously()` | Supabase rate limits; RLS scopes everything |
| Read own customer row | `select` under RLS | own data |
| Read own consent history | `select` under RLS | own data |
| Read own transactions | `select` under RLS | own data, RLS-scoped |
| Read `legal_documents` | `select` where `published` | public content |
| Subscribe to Realtime `transactions` | RLS-scoped | device sees only its store |
| Count own templates | `face_templates_public` view | no embedding exposed |

Everything else goes through a function. Notably: **no direct insert into `transactions`,
`face_templates`, `payment_events`, or `customers`.**
