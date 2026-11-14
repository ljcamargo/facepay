# 11 — Glossary

| Term | Meaning |
| --- | --- |
| **ARCO** | Derechos de Acceso, Rectificación, Cancelación y Oposición — Mexican data-subject rights. |
| **Aviso de privacidad** | Mexican privacy notice. *Integral* (full) and *simplificado* (short, shown at capture). |
| **Banxico** | Banco de México, the central bank; operator of SPEI and CoDi. |
| **CLABE** | 18-digit standardized bank account number in Mexico. |
| **CoDi®** | Cobro Digital: Banxico's instant payment rail over SPEI, initiated by QR or push notification. |
| **codiId** | 20-digit folio Banxico assigns to a CoDi request. Show it on receipts. |
| **Codi QR / IDC** | The Banxico identifier of a CoDi QR (`codiQrId` in the QR webhook). |
| **Conventional Commit** | `type(scope): summary` commit format. |
| **Cosine similarity** | `1 - (a <=> b)` for unit-normalized vectors; our matching metric. |
| **Embedding / template** | Fixed-length numeric representation of a face (1024 floats here). Not an image; still sensitive data. |
| **Edge Function** | Deno function deployed with Supabase; our backend. |
| **E.164** | International phone format, e.g. `+525512345678`. |
| **FAR / FRR** | False Accept Rate / False Reject Rate. |
| **HNSW** | Approximate nearest-neighbour index used by pgvector. |
| **Idempotency key** | Client-supplied value that makes retries safe. |
| **Liveness / antispoofing** | Detecting that the face is physically present and not a photo, video, mask, or synthetic stream. |
| **Margin** | Difference between the best and second-best match; below it we return `ambiguous`. |
| **numRef** | Numeric reference (≤ 7 digits) attached to a CoDi request. |
| **OTP** | One-time password sent by SMS/WhatsApp. |
| **pgvector** | Postgres extension for vector storage and similarity search. |
| **PN (push notification)** | CoDi request sent to a cell number; the payer approves it in their bank app. |
| **RLS** | Row Level Security: Postgres policies that scope rows per JWT. |
| **security definer** | Postgres function that runs with the owner's privileges; used with a pinned `search_path`. |
| **SPEI** | Sistema de Pagos Electrónicos Interbancarios (Mexico's instant transfer rail). |
| **Standard Webhooks** | Webhook signature scheme: `webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_` secret, HMAC-SHA256. |
| **Supabase anon key** | Public API key; safe in the browser because RLS applies. |
| **Supabase service_role** | Bypasses RLS. Server-only; leaking it is a full compromise. |
| **Turnstile / CAPTCHA** | Bot protection for the public onboarding endpoints. |
| **ULID** | Lexicographically sortable identifier used by pey for transactions. |
| **WASM / WebGL** | Browser runtimes used by the face models (TFJS backend preference: webgl → wasm → cpu). |
| **Webhook** | Signed HTTP POST that pey sends when a payment completes. |
