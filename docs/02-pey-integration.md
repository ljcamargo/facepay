# 02 — pey.mx integration

Source of truth: <https://docs.pey.mx> and the OpenAPI spec at <https://docs.pey.mx/openapi.json>
(`title: CoDi API`, `version: 2026-10-20`). Everything below was read from those, not from memory.
Re-verify before Phase 8; if the spec changes, this file and `packages/pey-client` change together.

## 1. What pey does and does not do

- **Does:** create CoDi QRs, send CoDi push notifications via Banxico, host payment links, sign
  webhooks, expose transaction lookups.
- **Does not:** hold customer accounts, store customer faces, provide a sandbox, verify phone numbers,
  send OTP/SMS on our behalf, or let you cancel a sent push notification. There is **no OTP endpoint**
  in the OpenAPI spec: the only message the customer receives from our side is the CoDi push, delivered
  by their bank.

The merchant onboards at `portal.mipey.mx`: profile → payment account (`codi` and/or `stripe`) →
API key. A CoDi bank account takes **up to 5 business days** to activate at Banxico. While waiting,
pey publishes a testing account (CLABE `012180015826225713`, "Ramón Orraca Lascurain") that activates
immediately — **payments sent there are not returned, use $0.01**.

## 2. Environments

| | URL |
| --- | --- |
| Production API | `https://api.pey.mx` |
| Dev API | `https://api.dev.pey.mx` (announced; docs still say "coming soon") |
| Test portal | `portal.dev.mipey.mx` (`test` keys) |
| Live portal | `portal.mipey.mx` (`live` keys) |

**There is no sandbox.** The official guidance is to test in production with $0.01 MXN. Consequence
for this project: CI never calls pey; only manual, budgeted tests do (`docs/12-testing.md`).

Auth: `Authorization: Bearer <api-key>`. Every key is bound to exactly one `codi` and one `stripe`
payment account.

## 3. Endpoints we use

### 3.1 `POST /codi/pn` — Create Push Notification

```json
{
  "amount": 80.0,
  "phoneNumber": "5512345678",
  "concept": "Pedido #12345",
  "expiration": 600,
  "numRef": "0042317",
  "metadata": { "txId": "9f1c…", "storeId": "…" }
}
```

| Field | Rules |
| --- | --- |
| `amount` | number, `> 0`, `≤ 1_000_000` MXN |
| `phoneNumber` | string, `^[0-9]{10}$` (no `+52`, no spaces) |
| `concept` | free text, shown to payer — keep ≤ 40 chars for bank apps |
| `expiration` | integer seconds, **min 360**, default 360 |
| `numRef` | `^[0-9]{1,7}$`, default `"0"` |
| `bankAccountId` | optional ULID; omitted → key's default CoDi account |
| `metadata` | ≤ 50 scalar pairs, keys ≤ 40 chars, values ≤ 500 chars, echoed back as strings |

Response `200`:
```json
{ "transactionId": "01J5KXYZ1234567890ABCD", "codiId": "12345678901234567890" }
```
`transactionId` (ULID) is our join key. `codiId` is Banxico's 20-digit folio (display it on the
receipt; some banks show it).

Errors `400` with `error.type` ∈ `INVALID_REQUEST | INCOMPLETE_PARAMETERS | INVALID_PARAMETER |
INVALID_AMOUNT | INVALID_STATE | PEY_CONSISTENCY_ERROR | BAD_REQUEST`, plus `error.requestId`.
`503` = maintenance (`SERVICE_UNAVAILABLE | FLAGS_UNAVAILABLE`). `500` = unknown internal.

### 3.2 `POST /codi/qr` — Create QR

```json
{ "amount": 80.0, "concept": "Pedido #12345", "expiration": 600, "numRef": "0042317",
  "generateImage": false, "metadata": { "txId": "…" } }
```
`amount` may be `0` (payer types it). `expiration` `0` = never, otherwise `≥ 360`.
`201` → `{ id, qrString, qrImage|null }`.
`qrString` is a **JSON payload**, not a URL: `{"TYP":1,"v":"01","ic":0,"IDC":"AB12CD34EF"}`.
Render it client-side with a QR library (`generateImage:false` is faster); `qrImage` is a base64 PNG
if you ask for it. **CoDi QR ≠ generic SPEI QR** — must be scanned by a CoDi-capable bank app.

### 3.3 `GET /transaction/{id}` — status

`{ id, status: "PENDING"|"PAID", amount, amountBreakdown, currency, paymentMethod,
payableType: "API_CODI_QR"|"API_CODI_PN"|"PAYMENT_LINK", payableId, description,
applicationFee?, dateCreated, datePaid?, metadata }`

`metadata` (CoDi only): `clabe`, `bankCode`, `accountType`, `description`, `trackingKey`, and
`externalMetadata` = the pairs we sent. Use it for the receipt (mask the CLABE to last 4).

Also available: `GET /transaction/api-key?nextToken=` (80/page, newest first) and
`GET /transaction/codi/qr/{id}` for QR-level history. Useful as a reconciliation fallback.

### 3.4 Payment links — out of scope

v0.2 is CoDi only. `POST /payment-link/create` (cards, Apple Pay, Google Pay) is documented by pey but
**not used**: no Stripe account, no second settlement flow. If scope reopens, it requires HTTPS
`successUrl`/`backUrl`, an optional tip flag, and the `payment_link.status_updated` webhook.

## 4. Webhooks

One URL **per API key**. All event types arrive at that one URL.

Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<b64>` (space-separated list is
allowed). Standard Webhooks spec:

```
signed_content = `${webhook-id}.${webhook-timestamp}.${raw_body}`
secret_bytes   = base64decode(secret.replace(/^whsec_/, ""))
expected       = base64encode(HMAC_SHA256(secret_bytes, signed_content))
```

Verify with a **constant-time compare over every `v1,` entry**, reject if `|now - timestamp| > 300 s`,
then use `webhook-id` as the idempotency key.

### 4.1 `codi.pn.payment_received`

```json
{
  "amount": 100, "apiKeyId": "01M3…", "bankAccountId": "01JBA…",
  "concept": "(dev) Order 45", "datePaid": 1790724758, "numRef": "4567",
  "transactionId": "01M3QR5E7XHXMNZDEPFH3JAWS0",
  "type": "codi.pn.payment_received",
  "metadata": {
    "clabe": "000000000000000000", "bankCode": 40012, "accountType": 40,
    "description": "(dev) Order 45", "trackingKey": "0192191042",
    "externalMetadata": { "txId": "…" }
  }
}
```

`metadata.bankAccountId` is only present when we sent `bankAccountId`. `amount` is the final amount
(including any fee the payer saw, if applicable) — **compare against `amount_cents/100` and flag
mismatches instead of trusting silently**.

### 4.2 `codi.qr.payment_received`

Same shape + `codiQrId` (Banxico IDC). A QR is not a transaction; if a QR is paid twice, you get two
transactions for one `codiQrId` (design your UI to reuse/dispose QRs).

### 4.3 `payment_link.status_updated` (not used in v0.2)

`{ type, id, status: pending|processing|paid, clientReferenceId, transactions: [...] }`.

## 5. Handler structure (Edge Function `webhooks-pey`)

```
1. raw = await req.text()                       // never parse before verifying
2. h = { id: header('webhook-id'), ts, sig }
3. if (!verify(raw, h, PEY_WEBHOOK_SECRET)) → 401 (log, no body echo)
4. if (txn.received_at - ts) > 300s           → 401 stale
5. insert payment_events(webhook_id UNIQUE, type, payload, signature_verified=true)
     on conflict do nothing
   if 0 rows → 200 { ok: true, duplicate: true }   // fast, idempotent
6. validate payload (zod) → route by `type`
7. resolve transaction:
     a. pey_transaction_id = payload.transactionId
     b. else metadata.externalMetadata.txId
     c. else payment_events.status='orphan' + alert, still 200
8. status transition guard: only created|awaiting_payment|expired|cancelled → paid
     (paid → paid is a no-op; failed → paid allowed with alert)
9. update transaction: status, paid_at = datePaid, payer_clabe_last4, payer_bank_code,
     late_payment = (status was cancelled|expired), receipt_no assigned
10. insert audit_log, update payment_events.processed_at
11. 200 { ok: true }
```

Failure handling: if step 7–10 throws, set `payment_events.processing_error` and return **500** so
pey retries; the `webhook-id` guard makes the retry safe. Never return 200 on a write failure.

## 6. Idempotency & reconciliation

| Risk | Control |
| --- | --- |
| Same webhook delivered twice | `payment_events.webhook_id` unique → second is a no-op 200 |
| Double "Cobrar" tap | `transactions.idempotency_key` unique per checkout; function returns the existing row |
| Webhook lost | Cron every 2 min: pending transactions older than 60 s → `GET /transaction/{id}`; also hourly `GET /transaction/api-key` sweep for unknowns |
| Late payment after cancel | webhook wins; `late_payment = true`; receipt still issued; cashier banner |
| Amount mismatch | store both, mark `needs_review`, alert; never silently accept |
| Unknown `transactionId` | orphan event row + alert; manual resolve in admin |

Reconciliation runs as a Supabase Cron job (`pg_cron` + `pg_net`) calling `/internal/reconcile` with a
shared secret header, or a Netlify scheduled function if pg_net is unavailable.

## 7. Error → UX mapping

| pey response | Meaning | UI (es-MX) | Next step |
| --- | --- | --- | --- |
| `400 INVALID_PARAMETER` (phone) | malformed number | "Revisa tu número a 10 dígitos" | re-enter |
| `400 INVALID_STATE` | CoDi not enabled on key | "El cobro CoDi no está disponible" | alert + QR/link |
| `400 PEY_CONSISTENCY_ERROR` | key/bank account misconfigured | "Configuración incompleta" | alert ops |
| `400 INVALID_AMOUNT` | amount out of range | "Monto no válido" | back to checkout |
| `503` | maintenance | "El servicio no está disponible" | QR/link |
| timeout / 5xx | unknown | "No pudimos enviar la solicitud" | 1 retry, then QR |
| webhook never arrives | customer didn't approve / lost | "No recibimos confirmación" | retry (≤3/10 min) or QR |

## 8. Operational limits to design around

- `numRef` ≤ 7 digits → use a per-store daily counter, zero-padded; collisions across stores are
  fine because the merchant account is per API key.
- Concept is displayed in the payer's bank app: keep it short, never include PII.
- `expiration` 360 s minimum. We send 600 s for kiosks (customer must open their bank app) and show
  the remaining time based on our own clock, not the provider's.
- 1M MXN cap per transaction (provider); our pilot cap is much lower (`docs/07`).
- One webhook per key → staging and prod need separate keys.
- Rate limits are undocumented → assume enforcement, back off on 429/5xx, never retry a 4xx.

## 9. Test plan (manual, budgeted)

1. $0.01 PN to your own CoDi-enrolled cell → approve → webhook → receipt.
2. Replay the same webhook body → still one `paid` row, one receipt.
3. $0.01 QR → scan → pay → webhook with `codiQrId`.
4. Force a 4xx (invalid phone `123`) → no transaction left in `awaiting_payment`.
5. Cancel locally, then approve the push → `paid` + `late_payment = true`.
6. Kill the webhook URL → reconciliation marks it paid within 5 min.

Record outcomes in `MEMOIRS.md`; each test costs real money.
