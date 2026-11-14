# 07 — Security & privacy

> Not legal advice. Mexico's federal data-protection framework was reformed in 2025 (the former
> INAI was dissolved and a new federal data-protection statute was published; secondary rules were
> still settling at the time of writing). Treat §6 as a checklist to take to counsel, not as
> compliance. Do not enroll a real customer until a lawyer signs off on the aviso and the consent
> flow.

## 1. Security model in one paragraph

The biometric is a **selector**, not an authenticator. It answers "which phone number should receive
this payment request?". The money moves inside the customer's banking app, under the bank's own
authentication and Banxico's CoDi rules. Therefore the assets we actually protect are (a) the
biometric templates and phone numbers, (b) the integrity of the transaction records, and (c) the
merchant's account — not "the payment authorization". Every control below follows from that.

## 2. Assets and classification

| Asset | Class | Where | Consequence if leaked |
| --- | --- | --- | --- |
| Face templates (1024 floats) | **sensitive personal data** | Postgres (pgvector) | Linkage/re-identification, irreversible reputation harm |
| Phone numbers (E.164) | personal data | Postgres, Auth | Harassment, phishing, identity linkage |
| Consent records | legal evidence | Postgres | Invalid consent → unlawful processing |
| Transaction records | financial | Postgres | Fraud analysis, accounting damage |
| Device tokens | credential | kiosk IndexedDB | Unauthorized payment requests for one store |
| pey API key / webhook secret | **secret** | Supabase secrets | Attacker could send payment requests and read events |
| Supabase `service_role` | **secret** | Edge Functions only | Full DB access |
| Staff PIN hashes | credential | Postgres | Settings tampering |

## 3. Threat model (MVP scope)

| # | Threat | Vector | Controls | Residual |
| --- | --- | --- | --- | --- |
| T1 | Spoofed face → wrong person identified | printed photo, screen replay, video, deepfake | random challenge, `real`/`live` scores, quality gates, confirmation screen, low caps, audit | **Accepted** for MVP; native/certified liveness for production |
| T2 | Enroll someone else's face | attacker photographs a bystander, signs up with their own phone | signup only on the customer's own device via the QR session; notice before capture; 1 template per session; kiosk cannot enroll (ADR-016) | Low |
| T3 | Claim a phone number you don't own | no OTP in the MVP | the number is a claim; only a **paid push** proves control; bank approval still required | **Accepted**, documented (ADR-014) |
| T4 | Malicious cashier spams payment requests | taps "cobrar" repeatedly on a known customer | 3 pushes / 10 min / customer, 30 / hour / device, audit log, per-customer merchant block, daily report | Low |
| T5 | Cashier inflates amount then pockets cash | UI manipulation | amounts are stored server-side before the push; receipts serialized; owner report | Medium (process, not code) |
| T6 | Kiosk stolen / tampered | physical access | device revocation, per-store RLS, no secrets on device, amount cap, PIN for settings, kiosk mode | Medium |
| T7 | Camera injection (virtual cam / rooted tablet) | OBS, ADB | not detectable in-browser | **Accepted**; native attestation later |
| T8 | Webhook forgery / replay | direct POST to the function | HMAC-SHA256, 300 s window, `webhook-id` dedupe, `apiKeyId` check | Low |
| T9 | DB/backup leak | credential compromise | RLS, no direct template read policy, service_role only in functions, encryption at rest, separate staging project, rotation | Medium |
| T10 | Identity oracle | attacker probes "does this face exist?" via the API | device JWT required, 20/5 min/device, generic `no_match` response, no phone ever returned in full | Low |
| T11 | Cross-tenant data access | forged device JWT / bad RLS | RLS on every table, `current_device_store_id()` in `security definer`, RLS test suite from 3 identities | Low |
| T12 | Secret leakage via frontend bundle | accidental import | `pey-client` is server-only (`import 'server-only'`), CI greps the build for `service_role`/`PEY_` | Low |
| T13 | Payment request to a non-CoDi phone | wrong number, no CoDi | 4xx handling + QR fallback + copy "Ese número no tiene CoDi activo" | Low |
| T14 | Lost webhook → unrecorded money | network / pey outage | reconciliation every 2 min + hourly sweep + `orphan` events | Low |
| T15 | Duplicate charge attempt | double tap / retry | `idempotency_key`, one `pey_transaction_id` per row, no re-send while `awaiting_payment` | Low |
| T16 | Harassment of a customer by a merchant | repeated requests | per-customer block table, rate limits, consent revocation, complaint channel | Medium |
| T17 | Model supply chain | tampered model files | self-hosted, pinned version, checksum in `docs/`, no CDN | Low |
| T18 | Minors enrolled | no gate | 18+ attestation at consent, deletion on request | Medium |

Out of scope for the MVP: unattended payments, refunds, card data (never touches us), merchant
onboarding fraud, physical robbery.

## 4. Controls by layer

**Client (kiosk)**
- Anonymous Supabase session bound to one device row; server checks `status='active'` on every call.
- No secret, no service role, no embeddable admin URL.
- Camera frames never leave the device; no `console.log` of arrays; error reports strip pixels.
- Settings behind staff PIN; unpair requires the PIN; device heartbeat detects revocation.
- Wake lock, kiosk mode, auto-return, no devtools shortcuts (best effort).

**Edge Functions**
- zod validation on every body; reject unknown keys.
- Caller identity re-derived from the JWT, never from the body (`storeId` in a body is ignored).
- Rate limits in Postgres (survives cold starts).
- Amount caps enforced server-side; concept sanitized.
- Errors: Spanish message for users, English code + `requestId` in logs, never the provider payload.
- No PII in logs: phone is logged as `•••• 5678`, embeddings as `sha256[0:8]` + length.

**Database**
- RLS on all tables, explicit `revoke` before `grant`.
- `face_templates` has no select policy for `authenticated`; access only through
  `identify_customer()` and a metadata-only view for the owner.
- `payment_events` contains full payer CLABE → service role only.
- Nightly retention jobs; deletion cascades from `auth.users`.
- Staging and production are different projects with different keys; no prod dumps into staging
  without masking.

**pey**
- API key and webhook secret only in Supabase secrets; rotate via the portal and re-deploy.
- One API key per environment; one webhook URL per key.
- `bankAccountId` pinned to the store's account, so a misconfigured key cannot route money elsewhere.

**Operations**
- Least-privilege access to Supabase/Netlify/pey portals; 2FA on all three.
- `MEMOIRS.md` records every secret rotation (never the secret).
- Incident runbook in `docs/09-runbook.md`; test the restore path once before the pilot.

## 5. Privacy by design

| Principle | Implementation |
| --- | --- |
| Purpose limitation | The template is used only for identification at checkout. No age/gender/emotion inference is stored or shown (Human can produce them; we disable those modules). |
| Data minimisation | No images, no email, no address, no birthdate. `display_name` optional (first name only). Phone masked everywhere it is displayed. |
| Consent | Explicit, separate checkbox for biometrics, versioned document + hash, timestamp, IP/UA, revocable. Refusing must not block payment (QR path). |
| Transparency | Kiosk states what is stored and why; a `BiometricFingerprint` shows that a template (not a photo) exists; `/mi-cuenta` lists templates, consents and transactions. |
| Storage limitation | Templates until revoked or 24 months of inactivity; identification audits 90 days; events 2 years; transactions 5 years (accounting). |
| Integrity | RLS, audit log, append-only consent/event tables, receipt numbering. |
| Accountability | This file, the DPIA draft, and the audit log. |

**Data map**

| Data | Purpose | Basis | Retention | Processors |
| --- | --- | --- | --- | --- |
| Phone (E.164) | Route the CoDi push | Consent (claim; verified only by a paid push) | account life + 30 d | Supabase, pey |
| Face template | Identify returning customer | **express consent** | until revoked / 24 mo | Supabase |
| Consent evidence | Prove consent | legal obligation | 5 years | Supabase |
| Transaction (amount, status, folio, masked CLABE) | Sell, account, disputes | contract / legal | 5 years | Supabase, pey |
| Identification audit (no image) | Accuracy, abuse, disputes | legitimate interest + consent | 90 days | Supabase |
| Device metadata (UA, version) | Support, security | legitimate interest | 1 year | Supabase, Netlify |

No international transfer beyond the chosen Supabase region (proposal `us-east-1`) and the SMS
provider's routing. **Disclose this in the aviso.** If data must stay in Mexico, the architecture
allows a self-hosted Postgres — but not on Supabase Cloud.

## 6. Legal checklist for counsel (Mexico)

**Framework.** Federal data-protection law (post-2025 reform), its regulations, and the privacy
guidelines in force. Biometric data is **sensitive personal data**, which requires **express and
written consent** (electronic form is acceptable if it is attributable and verifiable), and cannot be
conditioned on the service.

- [ ] Identify the **responsable**: the merchant (store) is the data controller; FacePay MX acts as
      **encargado** (processor). The aviso must be issued by the merchant, with FacePay MX named as
      processor. → `legal_documents` must be **per store** (template + store data), not global.
- [ ] **Aviso de privacidad integral** (and a simplified version shown at the point of capture) with:
      identity and domicile of the responsable, data collected, purposes (necessary vs secondary),
      sensitive-data section, transfers, ARCO contact, consent-withdrawal mechanism, retention,
      security measures, and the change procedure.
- [ ] **Separate biometric consent** text, distinct from the general privacy notice, with an explicit
      statement that refusing does not prevent payment by other means.
- [ ] **ARCO + revocation** channel with a stated response time (law: 20 business days, extendable),
      implemented as `delete_my_account` / `revoke_my_face`.
- [ ] **Data-processing agreement** between merchant and FacePay MX (confidentiality, security
      measures, sub-processors: Supabase, Netlify, SMS provider, pey).
- [ ] **Security measures** documented (administrative, technical, physical) — this file plus the
      runbook is the basis.
- [ ] **Retention policy** and a deletion procedure that keeps accounting records valid without
      retaining identity (anonymized hash).
- [ ] **Transfers**: none to third parties beyond processors; if a processor is abroad, disclose and
      (where required) obtain consent.
- [ ] **Minors**: 18+ attestation; no enrollment of minors.
- [ ] **DPIA / evaluación de impacto** — biometric identification at scale is high-risk; produce one
      before the pilot.
- [ ] **Breach procedure**: detect, contain, document, notify affected data subjects and the
      authority as applicable; keep a breach register.
- [ ] **Consumer protection (PROFECO)**: displayed price == charged amount, receipt issued, refund
      policy stated, no misleading "biometric security" claims in marketing.
- [ ] **Payment regulation**: we are a merchant tool, not a PSP. Never hold funds, never split
      payments, never route to an account other than the merchant's registered one. CoDi rules and
      Banxico circulars apply to pey as the provider.
- [ ] **Accessibility / language**: aviso and consent available in Spanish; keep the exact text
      version that was accepted (hash) for evidentiary purposes.

### 6.1 Placeholders I must fill before a real customer signs up

The legal copy ships with placeholders, because the responsible party is the merchant and we do not have
its corporate data yet. These are the only blanks; everything else is written.

| Placeholder | Needed for | Owner provides |
| --- | --- | --- |
| `{{LEGAL_NAME}}` | aviso de privacidad (responsable) | persona moral |
| `{{RFC}}` | aviso | persona moral |
| `{{ADDRESS}}` | aviso (domicilio) | persona moral |
| `{{PRIVACY_EMAIL}}` | canal ARCO | persona moral |
| `{{ARCO_URL}}` | página de derechos | product |
| `{{PERSON_IN_CHARGE}}` | aviso (responsable de datos) | persona moral |
| `{{STORE_NAME}}` | recibos, kiosco, concepto por defecto | product |
| `{{EFFECTIVE_DATE}}` | aviso y consentimiento | legal |
| `{{DPO_CONTACT}}` | aviso | legal (si aplica) |

Rules: the template lives in `legal_documents.body_md`; the published row must have **no** `{{…}}`
left — add a DB check or a publish-time validator that rejects unresolved placeholders. The accepted
`sha256` is stored in `biometric_consents`, so editing the text after anyone accepted it means a new
version, not an edit in place.

I will flag each placeholder as it becomes blocking (Phase 3, before the first real signup).

## 7. Hard limits we impose on ourselves (MVP)

1. Pilot guardrail: **$300 MXN** per face-initiated charge (configurable per store, enforced
   server-side). This is not a security control — it bounds the blast radius of a demonstration.
2. Above the guardrail the cashier must use the CoDi QR path, with the customer scanning and approving
   in their own app.
3. No unattended mode; a staff member is always within reach.
4. No images, ever. If dispute handling later needs a thumbnail, it is a new ADR with encryption,
   TTL ≤ 72 h, and separate consent.
5. No emotion/age/gender inference enabled or stored.
6. No sharing of templates between merchants; `store_id` scoping is available even though matching is
   global by default.
7. No marketing use of biometric data. Ever.
8. Kill switch: one flag in `stores` disables face payments instantly, falling back to QR.

## 8. Incident response (see runbook for commands)

1. **Contain**: revoke device, rotate `service_role` + JWT secret + pey key + webhook secret, disable
   face payments for the store.
2. **Assess**: which tables were reachable, whether templates or CLABEs were exposed, time window.
3. **Notify**: merchant owner within 24 h; affected customers and authority per counsel.
4. **Record**: `MEMOIRS.md` entry with timeline, no secrets, no PII.
5. **Fix + verify**: add the missing control, add a regression test, re-run the RLS suite.

## 9. Outstanding (post-MVP) — do not ship without closing these

| # | Item | Why it is not closed | Where it lands |
| --- | --- | --- | --- |
| O1 | **1:N search of non-registered walk-ins** | we embed every unknown visitor to answer "is this a customer?" That is biometric processing of a non-consenting person. MVP mitigations: visible camera notice, embedding discarded after the lookup, no image, only aggregate scores in `face_identifications`. | DPIA + counsel opinion on the legal basis; signposting copy |
| O2 | **Unverified phone numbers** | no OTP (ADR-014). A claimed number can receive requests meant for someone else, and a stranger's face can be bound to the claimant's number. | SMS/WhatsApp OTP via the Send SMS Hook, or "auth by paid push" |
| O3 | **Account recovery / ARCO without an account** | an anonymous session lives only in the phone's storage; lose the phone, lose self-service deletion. | support channel, or a recovery flow that does not become face authentication |
| O4 | **Liveness vs. determined spoofing** | browser-only anti-spoofing loses to a live actor, a mask, a deepfake or a virtual camera. | certified SDK or native + Play Integrity (Phase 12) |
| O5 | **Template expiry notification** | we expire silently because we have no messaging channel. | same channel as O2 |
| O6 | **Cross-store matching default** | `scope=global` means a template is matchable by every merchant in the platform. | customer-facing choice at enrollment (schema ready) + counsel review |
| O7 | **Backups contain templates** | encrypted at rest by the provider, but a restore into a scratch project exposes them. | masked restore procedure, key management, access log |

## 10. Anexo en español (para revisión legal)

Resumen del tratamiento, para que un abogado en México pueda revisarlo sin leer todo el repositorio.

**Qué se guarda.** Una plantilla matemática del rostro (1024 números). **No** se guardan fotografías,
video ni imágenes derivadas. También se guarda el número celular que el cliente escribe, la fecha y
versión del aviso de privacidad que aceptó, y el registro de la compra (monto, folio, estado).

**Para qué.** Únicamente para reconocer al cliente en la tienda y enviarle una solicitud de cobro CoDi
a su celular. El pago lo autoriza el cliente en la aplicación de su banco. El rostro **no** autoriza
cargos, no desbloquea nada y no se usa para publicidad ni para inferir edad, género o emociones.

**Quién es el responsable.** La tienda (comercio) es la responsable del tratamiento; FacePay MX actúa
como encargado. Por eso el aviso de privacidad debe emitirse a nombre de cada tienda, con la versión y
el hash que el cliente aceptó.

**Consentimiento.** Se pide en dos pasos: aviso de privacidad y una casilla separada de consentimiento
expreso para datos biométricos. Se muestra **antes** de encender la cámara. Negarse no impide pagar:
siempre existe la ruta de QR CoDi.

**Personas no registradas.** Cuando alguien no está registrado, su rostro se procesa una sola vez para
buscar coincidencia y la plantilla se descarta; solo quedan puntajes agregados y sin imagen. Este punto
requiere una evaluación de impacto y la opinión del abogado (O1).

**Derechos ARCO y borrado.** El cliente puede revocar su plantilla y borrar su cuenta desde
`/mi-cuenta`. Si perdió el celular, hoy requiere soporte (O3).

**Retención.** Plantilla: hasta que la revoque o hasta 180 días sin uso, con paso de re-confirmación
hasta el doble del plazo. Compras: 5 años por obligaciones contables, sin conservar la identidad
(se anonimiza). Registros de identificación: 90 días.

**Transferencias.** Supabase (base de datos y funciones), pey/Banxico (solicitud de cobro). No se
comparten plantillas entre comercios salvo que el cliente elija el alcance global (O6).
