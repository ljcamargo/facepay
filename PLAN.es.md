# PLAN — FacePay MX (v0.2, 2026-11-14)

Documento de planeación de un punto de venta en tablet que identifica clientes por rostro y solicita
el pago mediante **push CoDi®** a través de **pey.mx**. Este documento es la fuente de verdad del
alcance y de los límites entre fases. Los detalles de implementación viven en `docs/`.
Espejo en inglés: [`PLAN.md`](PLAN.md).

**Estado:** pendiente de aprobación de la Fase 0. No existe código de aplicación.

## Bitácora de cambios

- **v0.2 (2026-11-14):** alcance cerrado a solo CoDi (sin tarjetas, sin links de pago); el kiosco ya no
  registra a nadie — el alta ocurre en el celular del cliente; sin SMS/OTP en el MVP; tope piloto
  baja a **$300 MXN**; se agregan alcance y caducidad de plantillas; se agrega el plan en español.
- v0.1: primera pasada de investigación.

---

## 0. Resumen

- **pey.mx no requiere cuenta de cliente.** Enviamos un teléfono + monto; Banxico entrega un push CoDi;
  el cliente aprueba en su app bancaria; recibimos un webhook firmado. El cliente necesita **CoDi
  activo en su banco**, no una cuenta Pey. → `docs/02-pey-integration.md`
- **pey no envía OTP.** Su API no tiene endpoint de SMS ni de verificación; el único mensaje que el
  cliente recibe de nuestra parte es el push CoDi, entregado por su banco. → §1.3
- **El QR CoDi es el producto base; el rostro sustituye el escaneo.** El rostro acelera un flujo que ya
  funciona, no es un método de pago nuevo.
- **El kiosco nunca registra a nadie.** Si la cara es desconocida, muestra un QR; el cliente se da de
  alta en su propio dispositivo, a su ritmo, con su propio rostro.
- **Rostro = identificación, no autenticación.** El banco autoriza el dinero. Esa es la decisión que
  sostiene todo y se declara en la UI, no solo en los documentos.
- **Backend = Supabase Edge Functions** (la llave de Pey y el webhook viven junto a la base). Next.js en
  Netlify es solo UI y no guarda secretos.
- **Candados del piloto:** $300 MXN por cobro iniciado con rostro, 3 push / 10 min / cliente. La
  caducidad de plantillas está **apagada por defecto**; una tienda puede activar un re-vinculo anual
  (ventanas más cortas, opcionales).
- **El trabajo de seguridad pendiente queda escrito**, no olvidado: §10 y `docs/07` §9.

---

## 1. Hallazgos de investigación

### 1.1 Qué hace pey (y qué no)

| Pregunta | Respuesta |
| --- | --- |
| ¿Quién entrega el push? | Banxico, a solicitud de pey. pey → Banxico → la app del banco del cliente. |
| ¿Implementamos pagos? | **No.** Una llamada HTTP + un webhook. La liquidación es banco a banco. |
| ¿El cliente necesita cuenta pey? | **No.** Solo el comercio, en `portal.mipey.mx` + una cuenta CoDi vinculada. |
| ¿El cliente necesita CoDi? | **Sí** — activo en su app bancaria **y su celular enrolado** con ese banco. |
| ¿Podemos cancelar un PN enviado? | **No hay endpoint público.** Lo expiramos localmente; una aprobación tardía llega y se registra. |
| ¿Cómo sabemos que se pagó? | Webhook `codi.pn.payment_received`, más `GET /transaction/{id}` para conciliación. |
| ¿Sandbox? | **No.** La documentación dice probar en producción con $0.01. |
| ¿Auth del webhook? | Standard Webhooks (HMAC-SHA256, `webhook-id`, tolerancia de 300 s). |
| **¿API de OTP/SMS?** | **No existe.** pey no puede verificar un teléfono por nosotros. |
| Límites | monto `>0` ≤ 1,000,000; teléfono `^[0-9]{10}$`; `numRef` `^[0-9]{1,7}$`; PN `expiration ≥ 360`; QR `expiration = 0` o `≥360`. |
| Metadata | ≤50 pares escalares, devueltos como `metadata.externalMetadata` — nuestra llave de unión en el webhook. |
| Webhook por llave | **Una URL por API key**, todos los tipos de evento. |

### 1.2 Dos restricciones del proveedor que dan forma al producto

1. **La cobertura de CoDi es parcial.** Un cliente sin CoDi no puede pagar por push *ni* por QR CoDi.
   Como las tarjetas quedan fuera de alcance (v0.2), este es un techo duro de alcance y debe decirse
   claramente, no maquillarse.
2. **No podemos verificar un número de teléfono.** Consecuencia en §1.3.

### 1.3 Identidad del cliente, sin SMS

El plan original era OTP por teléfono con Supabase Auth. v0.2 lo quita del MVP (costo, proveedor,
entregabilidad). Lo que queda:

- El celular del cliente crea una **sesión anónima de Supabase** durante el alta.
- `customers.phone_e164` es una **afirmación, no un atributo verificado** (`phone_verified_at` queda
  `null`).
- La **única prueba real de control del teléfono** es un push CoDi pagado: si la persona aprueba la
  solicitud en su app bancaria, demuestra que controla esa cuenta y ese número.
- Por lo tanto: nunca tratamos el teléfono como verificado, nunca compartimos datos con base en él, y
  "vincular mis compras anteriores por teléfono" se elimina del MVP.

Riesgo residual: alguien puede registrarse con un número que no es suyo y enviarse las solicitudes a sí
mismo (paga sus propias compras), o vincular la cara de un tercero a su propio número (acoso al
tercero, que puede rechazar). Ambos están documentados en `docs/08-risks.md` (R09, R12) y son
aceptables para un demostrador con tope de $300.

**Opciones futuras, documentadas y no construidas:** (a) OTP por SMS/WhatsApp vía el *Send SMS Hook* de
Supabase; (b) "auth por push pagado" — una solicitud CoDi de $0.01 que, al aprobarse, prueba el control
del teléfono; (c) passkeys en el celular del cliente.

---

## 2. Rutas de pago

Solo CoDi. Sin tarjetas, sin Apple/Google Pay, sin links de pago.

| # | Ruta | Quién | Llamada pey | Registro |
| --- | --- | --- | --- | --- |
| **A** | Rostro → push | Cliente registrado | `POST /codi/pn` | sí, una vez |
| **B** | QR CoDi en la tablet | Cualquiera con CoDi | `POST /codi/qr` | no |
| **C** | Escribir tu número *en tu propio celular* → push | Quien quiera | `POST /codi/pn` | no (puede registrarse después) |

B es el flujo base y el respaldo universal. A es "lo mismo, sin escanear". C existe porque es la única
forma de pagar por push sin dar el rostro, y porque el número se teclea en el dispositivo del cliente —
nunca en la tablet compartida.

---

## 3. Flujos

### 3.1 Cliente registrado (objetivo < 12 s)

1. El cajero captura monto + concepto (presets + texto libre).
2. `POST /payments/checkout` → fila `transactions` en `created`, monto congelado en el servidor.
3. Cámara + control de calidad + reto de vivacidad aleatorio (parpadea / gira / sonríe / **muestra 2 dedos**).
4. El embedding se calcula en el navegador; el frame nunca sale del dispositivo.
5. `POST /face/identify` → top-2 en pgvector → `matched` | `ambiguous` | `no_match`.
6. `matched` → "¿Eres Ana? · •••• 5678" → "Sí, enviar solicitud a mi banco" / "No soy yo".
7. `POST /payments/push` → pey `POST /codi/pn` (600 s, `numRef`, `metadata.txId`).
8. Pantalla de espera: cuenta regresiva, "Ya pagué, actualizar", "Cancelar", "Usar QR".
9. Webhook → `paid` → Realtime → recibo.

### 3.2 Cliente nuevo (el kiosco muestra un QR, nunca registra)

1. `no_match` → pantalla de salida: **"Regístrate y paga con tu rostro"** (QR) + **"Pagar con QR CoDi"**
   + **"Pagar con mi celular"**. La venta siempre puede continuar sin registro.
2. QR = `https://app/onboarding/<token>`; token = 32 bytes aleatorios, SHA-256 guardado, TTL 15 min,
   ligado a tienda + monto + dispositivo. En el MVP no se envía nada del rostro al teléfono.
3. Celular del cliente: número a 10 dígitos → aviso de privacidad + consentimiento biométrico expreso →
   **selfie con vivacidad en su propio dispositivo** → plantilla guardada → "Pagar $80.00".
4. El teléfono dispara el push; la tablet pasa a la pantalla de espera vía Realtime sobre la sesión.
5. Si abandona en cualquier paso, la tablet vuelve a inicio por timeout y el cliente todavía puede pagar
   con el QR CoDi en pantalla.

Por qué el kiosco no captura el alta: procesaría un rostro antes de mostrar el aviso y permitiría que
cualquiera vinculara la cara de un tercero a su propio número. La captura de identificación del kiosco
es transitoria y nunca se guarda (§10.1).

**Optimización post-MVP (no construida):** el kiosco entrega su embedding en memoria a la sesión del
teléfono después del consentimiento, y el teléfono manda un solo frame de confirmación; el servidor
exige que ese frame coincida con el vector del kiosco antes de activar la plantilla. Ahorra ~8 s y
agrega casos límite de orden de consentimiento y repetición.

### 3.3 Pagar con QR CoDi (sin registro, sin rostro)

Kiosco `POST /payments/qr` → renderiza `qrString` en el cliente → el cliente escanea con su app
bancaria → webhook `codi.qr.payment_received` → recibo. El QR expira en 10 min; "generar otro" reutiliza
la misma transacción cuando es posible.

### 3.4 Pagar con celular, sin rostro

En el celular del cliente (misma página del QR, `?mode=pay`): escribe su número → acepta recibir el push
→ push → aprueba. No se guarda plantilla. Es la ruta para quien rechaza la biometría.

### 3.5 Ramas de falla

| Rama | Comportamiento |
| --- | --- |
| Cámara denegada / sin cámara | Rutas por QR + "pedir apoyo al cajero" |
| 2+ rostros, borrosidad, ángulo, oscuridad | Aviso en línea, no se envía solicitud |
| Vivacidad falla ×3 | Bloqueo de 60 s, salida por QR |
| `ambiguous` (top1−top2 < margen) | Nunca adivinar. "No pudimos identificarte con seguridad" → QR |
| "No soy yo" | Plantilla marcada para revisión, fila de auditoría, salida por QR |
| pey 4xx (número sin CoDi) | "Ese número no tiene CoDi activo" → QR |
| pey 5xx / timeout | Un reintento, luego QR + alerta |
| Sin webhook en 6 min | "No recibimos confirmación" → reintentar (≤3/10 min) o QR |
| Pago tardío tras cancelar | Gana el webhook: `paid` + `late_payment`, recibo + aviso al cajero |

---

## 4. Pantallas (wireframes y textos completos: `docs/05-ui-screens.md`)

```
/kiosk/checkout → /kiosk/identify → /kiosk/confirm → /kiosk/pay/{id} → /kiosk/receipt/{id}
                       │
                       └─ no_match → /kiosk/fallback ─┬─ QR registro  → /onboarding/{token}
                                                      ├─ QR CoDi      (en el mismo lugar)
                                                      └─ pagar por celular → /onboarding/{token}?mode=pay
```

Todas las pantallas muestran la leyenda: **"El rostro solo identifica. El pago lo autorizas en tu
banco."** La pantalla de confirmación agrega: **"No autorizamos cobros. Tu banco pide tu aprobación."**

---

## 5. Modelo de datos (DDL: `docs/03-database.md`)

```
auth.users (anónimo) ─1:1─ customers ─1:N─ face_templates (vector 1024, alcance, TTL)
                                 └─1:N─ biometric_consents

stores ─1:N─ devices (auth_uid = usuario anónimo del kiosco)
   │             └─1:N─ device_pairing_codes
   ├─1:N─ staff
   ├─1:N─ transactions ─1:N─ payment_events (webhook_id único)
   ├─1:N─ onboarding_sessions ─0:1─ transactions
   └─1:N─ legal_documents (por tienda; el comercio es el responsable)
```

Decisiones clave: centavos enteros; `vector(1024)` + HNSW coseno; sin imágenes; `scope`
(`global` | `store`) y `expires_at` en plantillas; caducidad **apagada por defecto** (una tienda puede activar re-vinculo a
365 días, más corto si lo pide); `phone_e164` sin verificar; `payment_events.webhook_id` único; RLS en
todas las tablas.

## 6. Endpoints (especificaciones: `docs/04-api.md`)

| Método | Ruta | Auth | Propósito |
| --- | --- | --- | --- |
| POST | `/payments/checkout` | dispositivo | Crear la transacción local |
| POST | `/face/identify` | dispositivo | Comparar embedding, devolver candidato enmascarado |
| POST | `/face/enroll` | cliente | Guardar plantilla (requiere consentimiento) |
| POST | `/payments/push` | dispositivo | `POST /codi/pn` |
| POST | `/payments/qr` | dispositivo | `POST /codi/qr` → `qrString` |
| GET | `/payments/{id}` | dispositivo \| cliente | Estado + conciliación |
| POST | `/payments/{id}/cancel` | dispositivo | Cancelación local |
| POST | `/onboarding/sessions` | dispositivo | Crear el token del QR |
| GET | `/onboarding/sessions/{token}` | público | Datos de la sesión |
| POST | `/onboarding/sessions/{token}/claim` | cliente | Vincular sesión al teléfono |
| POST | `/onboarding/sessions/{token}/pay` | cliente | Registrarse y pagar |
| POST | `/devices/claim` | anónimo | Emparejar un kiosco |
| POST | `/webhooks/pey` | firma | Todos los eventos de pey |
| POST | `/internal/reconcile` | secreto cron | Consultar transacciones pendientes |

---

## 7. Fases

| Fase | Entregable | Aceptación |
| --- | --- | --- |
| **0** | Documentos, esqueleto, plan bilingüe, `netlify.toml`, `.env.example` | aprobado; `package.json` válido |
| **1** | Monorepo, Next.js, Tailwind v4, shadcn, claro/oscuro/auto, páginas legales, preview en Netlify, **adaptador mock** | todas las pantallas navegables con datos de ejemplo, `MOCK_MODE=1`, cero llamadas de red; preview verde |
| **2** | Migraciones (tablas, enums, índices), RLS, funciones auxiliares, seed | `db reset` limpio; pruebas RLS con 3 identidades |
| **3** | Sesión anónima del cliente, consentimiento, `/mi-cuenta`, borrado | consentimiento con versión + hash; borrar elimina plantillas |
| **4** | `face-engine`: cámara, filtros de calidad, vivacidad (incl. reto con manos), embedding, **pico de calibración** | reporte FAR/FRR + go/no-go |
| **5** | Alta en el celular | plantilla guardada, con alcance, revocable |
| **6** | Emparejamiento del kiosco + pantalla de cobro | lecturas entre tiendas bloqueadas |
| **7** | Identificación + confirmación | 10/10 rostros propios, 0 falsos positivos en 20 personas |
| **8** | Push + pantalla de espera (Realtime) | $0.01 de punta a punta con un banco real |
| **9** | Webhook + recibo + idempotencia + pago tardío | webhook repetido no hace nada |
| **10** | QR CoDi, QR de alta, pago por celular, todas las ramas de falla | cada rama alcanzable y explicada en español |
| **11** | Endurecimiento: límites de tasa, auditoría, cron de conciliación, a11y, modo kiosco | soak de 30 min + simulacros de falla |
| **12** | Evaluación de Android (solo documento) + diseño del traspaso de vector del kiosco | decisión, no código |

Cada fase termina con una entrada en `MEMOIRS.md`, `lint/typecheck/test` en verde y el guion de demo de
`docs/12-testing.md`.

---

## 8. Preguntas abiertas

Resueltas en v0.2 (`MEMOIRS.md`, 2026-11-14 rev3): marca (FacePay MX), stack (web app React/Next; la
tablet es solo el navegador), región de Supabase (`us-east-1`), caducidad de plantillas (apagada por
defecto, re-vinculo anual opcional por tienda), alcance por defecto (global), responsable (FacePay MX
como placeholder hasta que exista la entidad del comercio), recibo (solo pantalla en el MVP), concepto
(texto libre, opcional, si está vacío se usa el nombre de la tienda), git (init + commit, el dueño
empuja), sin pruebas de pago hasta que el dueño lo pida.

Siguen abiertas y **bloquean el alta real, no la Fase 1**:

1. **Persona moral, RFC, domicilio, correo de privacidad y canal ARCO** — hay placeholders en la
   plantilla del aviso (`docs/07` §6.1). Debes proporcionarlos antes de que un cliente real se registre.
2. **Firma del abogado** sobre el aviso, el consentimiento biométrico y la búsqueda 1:N de personas no
   registradas (R29). Es el único punto que puede detener el piloto por razones legales.
3. **Opinión legal** sobre si la identificación de visitantes requiere un aviso más amplio u otra base
   legal.
4. **Cuenta pey** — perfil + cuenta de pago CoDi (hasta 5 días hábiles de activación) y la decisión de
   correr tú mismo las pruebas de $0.01, no el agente.
5. **Modelo de tablet** — solo se necesita para calibrar la Fase 4; se asume Chrome en Android.
6. **Nombre/logo de la tienda** para la pantalla de inicio y los recibos.

## 9. Fuera de alcance (MVP)

Tarjetas, Apple/Google Pay, links de pago, devoluciones, propinas, pagos divididos, cajón de efectivo,
inventario, facturas CFDI, pagos sin conexión, alta de comercios por autoservicio, app Android,
vivacidad certificada, analítica, i18n más allá de es-MX, certificación de accesibilidad, SMS/OTP,
contraseñas de cliente.

**Funciones diferidas explícitamente (no "nunca", solo no ahora):** envío de recibo por
WhatsApp/SMS/correo, avisos de vencimiento de plantilla, traspaso del embedding del kiosco al celular,
links de pago/tarjetas, app Android, historial de compras para el cliente, propinas.

## 10. Seguridad y privacidad pendientes (post-MVP, escritas a propósito)

Esto **no** está resuelto en el MVP. Se registra aquí y en `docs/07-security-privacy.md` §9 para que
nadie confunda el demostrador con un sistema productivo.

### 10.1 Procesamiento de visitantes no registrados
Cada cliente desconocido se convierte en embedding y se busca. Es procesamiento biométrico de alguien
que no dio su consentimiento. Mitigaciones del MVP: aviso visible en la cámara, embeddings desechados
tras la búsqueda (nunca persistidos), solo puntajes agregados en `face_identifications`, sin imágenes.
**Pendiente:** una evaluación de impacto (DPIA) y la firma del abogado sobre la base legal para la
búsqueda 1:N de clientes que entran a la tienda.

### 10.2 Teléfonos sin verificar
Sin OTP. Un número es una afirmación hasta que se paga un push. **Pendiente:** OTP por SMS/WhatsApp o
"auth por push pagado".

### 10.3 La vivacidad en navegador es vencible
Foto, repetición, máscara, deepfake, cámara virtual. Acotado por el tope de $300, la pantalla de
confirmación, los límites de tasa y el hecho de que el banco autoriza. **Pendiente:** SDK certificado o
nativo + Play Integrity.

### 10.4 Ciclo de vida de la plantilla
TTL + re-confirmación + alcance ya existen en el esquema; el flujo de re-confirmación es Fase 12.
**Pendiente:** avisar al cliente antes del vencimiento (requiere un canal que no tenemos).

### 10.5 Recuperación de cuenta y ARCO sin cuenta
Una sesión anónima perdida con el teléfono significa que no hay borrado autoservicio. **Pendiente:** un
canal de soporte, o una recuperación asistida por rostro que no se convierta en autenticación facial.

### 10.6 Residencia de datos y encargados
Región de Supabase, proveedor de SMS (ninguno aún), pey. **Pendiente:** confirmar con el abogado si se
requiere aviso de transferencia.

### 10.7 Lo que nunca debemos afirmar
Nada de "autenticación biométrica", "vivacidad certificada", "cumplimiento PCI" ni "tu rostro protege tu
dinero". La UI dice lo contrario y los documentos explican por qué.

---

## 11. Definición de terminado del demostrador

- Un cliente recurrente paga en menos de 20 s sin ayuda del cajero.
- Un cliente nuevo se registra en su propio celular y paga, sin que el kiosco guarde ni envíe su rostro.
- Quien rechaza la biometría paga con el QR CoDi en dos toques.
- Cortar la red a media transacción, repetir un webhook y tocar dos veces "cobrar" dejan la base
  correcta.
- Todas las pantallas declaran que el banco autoriza el pago.
- `MEMOIRS.md` explica cada desviación de este plan.
