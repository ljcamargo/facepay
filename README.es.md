# FacePay MX

[English](README.md) · [Español](README.es.md)

**Pagos en punto de venta vinculados al rostro para México, sobre CoDi® / SPEI vía la API de
[pey.mx](https://docs.pey.mx).**

Una tablet de punto de venta donde el cajero cobra un monto, el cliente mira la cámara y la
aplicación envía una **solicitud de pago CoDi® push** al celular registrado del cliente. El cliente
la aprueba dentro de **su propia app bancaria**. La tablet nunca cobra nada.

> **Estado: PLANEACIÓN (Fase 0, plan v0.2).** Todavía no hay código de aplicación. Empieza por
> [`PLAN.es.md`](PLAN.es.md) (inglés: [`PLAN.md`](PLAN.md)). Nada de este repositorio es productivo ni
> está validado legalmente.

---

## Qué es y qué no es

| Es | No es |
| --- | --- |
| Una capa de **identificación**: rostro → "¿quién es?" → su teléfono | Una capa de **autenticación**: el rostro nunca autoriza un pago |
| Un disparador de solicitudes CoDi **push** + receptor de webhooks | Un adquirente de tarjetas, wallet o transmisor de dinero |
| Un almacén de **plantillas** biométricas (solo vectores, sin fotos) | Una base de datos de fotografías de rostros |
| Un demostrador para un piloto en tienda | Biometría certificada para producción |

La autorización financiera ocurre **dentro de la app del banco del cliente** (con su NIP / rostro /
huella del banco). Un rostro falsificado puede, en el peor caso, enviar una solicitud de pago a la
persona equivocada, que la rechaza. Esa propiedad es la que hace defendible un MVP web — ver
[`docs/07-security-privacy.md`](docs/07-security-privacy.md).

## Stack

- **Web / POS:** TypeScript · React 19 · Next.js (App Router) · Tailwind CSS v4 · shadcn/ui ·
  lucide-react · next-themes (claro / oscuro / automático) · react-markdown · qrcode
- **Motor facial (navegador):** `@vladmandic/human` (detección + embedding de 1024 dims +
  antispoof/liveness + manos), MediaPipe Face Landmarker para el reto de vivacidad, ArcFace ONNX opcional
- **Backend:** Supabase (Postgres + pgvector, Auth, RLS, Realtime, Edge Functions, Cron)
- **Pagos:** API REST de pey.mx — **solo CoDi** (`/codi/pn`, `/codi/qr`, `/transaction/{id}`), con
  verificación de firma Standard Webhooks. Sin tarjetas ni links de pago (alcance v0.2).
- **Despliegue:** Netlify (runtime de Next.js) + Supabase
- **Futuro:** Android (requiere vivacidad nativa / Play Integrity — ver
  [`docs/06-face-recognition.md`](docs/06-face-recognition.md))

## Estructura del repositorio

```
facepay-mx/
├── README.md / README.es.md      # bilingüe
├── PLAN.md                       # alcance, flujos, fases, preguntas abiertas  ← empieza aquí
├── AGENTS.md                     # reglas de colaboración (humanos + agentes de IA)
├── MEMOIRS.md                    # bitácora de ingeniería (solo se agrega)
├── netlify.toml                  # configuración de despliegue
├── docs/                         # 01-architecture … 12-testing
├── apps/web/                     # POS Next.js + registro (Fase 1+)
├── apps/android/                 # placeholder, futuro
├── packages/                     # shared · pey-client · face-engine
├── supabase/                     # migraciones, Edge Functions, seed
└── scripts/                      # calibración, reconciliación, operación
```

## El flujo en una imagen

```
CAJERO                     TABLET (kiosco)                        CELULAR DEL CLIENTE          BANCO / BANXICO
   │                            │                                      │                          │
   │ monto + concepto ─────────▶│                                      │                          │
   │                            │ cámara + reto de vivacidad           │                          │
   │                            │ embedding → búsqueda en pgvector      │                          │
   │                       ┌────┴─────────────────┐                    │                          │
   │                 match │                      │ sin match          │                          │
   │                       ▼                      ▼                    │                          │
   │              "¿Eres Ana?"          QR + 3 salidas                 │                          │
   │                       │             ├ registrarse (celular) ─────▶│ aviso + selfie           │
   │                       │             ├ pagar con QR CoDi           │                          │
   │                       │             └ pagar con celular, registro después                    │
   │                       ▼                      │                    │                          │
   │            POST /codi/pn  ───────────────────┼───────────────────▶│ notificación push ──────▶│
   │                            "Esperando a tu banco…"                 │ aprueba en su app ───────▶│
   │                            ◀──────────── webhook codi.pn.payment_received ───────────────────│
   │                            recibo                                 │                          │
```

## Mapa de documentación

| Necesitas | Lee |
| --- | --- |
| Alcance, fases, qué se commitea y cuándo | [`PLAN.md`](PLAN.md) |
| Cómo colaborar en este repo | [`AGENTS.md`](AGENTS.md) |
| Qué cambió y por qué, a lo largo del tiempo | [`MEMOIRS.md`](MEMOIRS.md) |
| Plan en español | [`PLAN.es.md`](PLAN.es.md) |
| Detalles y límites de pey.mx | [`docs/02-pey-integration.md`](docs/02-pey-integration.md) |
| Esquema / RLS | [`docs/03-database.md`](docs/03-database.md) |
| Endpoints | [`docs/04-api.md`](docs/04-api.md) |
| Pantallas y textos en español | [`docs/05-ui-screens.md`](docs/05-ui-screens.md) |
| Modelos faciales, umbrales, anti-spoofing | [`docs/06-face-recognition.md`](docs/06-face-recognition.md) |
| Legal / privacidad / amenazas | [`docs/07-security-privacy.md`](docs/07-security-privacy.md) |

## Inicio rápido (Fase 1 — UI con datos de ejemplo)

```bash
bun install
bun run dev            # http://localhost:3000/kiosk
```

La Fase 1 **no necesita variables de entorno**: todo corre con datos de ejemplo. El emparejamiento
acepta cualquier código de 6 dígitos, el PIN de ajustes es `1234` y la rama de identificación
(conocido / desconocido / dudoso) se cambia en Ajustes → Modo demo. Recórrelo en dos pestañas: el
kiosco y el enlace QR que muestra.

La Fase 2 agrega la base de datos. No hace falta Docker: corre contra un proyecto dedicado de Supabase.

```bash
bunx supabase login
bunx supabase link --project-ref <ref>
SUPABASE_DB_PASSWORD=... bunx supabase db push --remote --include-seed --yes
SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
  bun run test:rls:remote
```

Kiosco: `/kiosk` · Emparejamiento: `/kiosk/setup` · Cuenta: `/mi-cuenta` · Legal: `/legal/privacy`,
`/legal/terms`, `/legal/about`

## Advertencias importantes

1. **pey.mx no tiene sandbox.** La documentación lo dice: prueba en producción con **$0.01 MXN** y
   la CLABE de pruebas, o con tu cuenta real. Nunca hagas pruebas de carga con la llave de producción.
2. **Las notificaciones push CoDi requieren que el celular del pagador esté enrolado en CoDi en su
   banco.** La cobertura en México es parcial y las tarjetas están fuera de alcance: un cliente sin CoDi
   no puede pagar. Mantén siempre visible el respaldo de QR CoDi y dilo con claridad.
3. **El kiosco nunca registra a nadie.** El alta ocurre en el celular del cliente, después del aviso de
   privacidad. La captura de identificación del kiosco es transitoria y nunca se guarda ni se reenvía.
3. **Un rostro no es una contraseña.** Sirve para elegir *a quién cobrarle*. Nunca debe ser el único
   factor para mover dinero, y este repo no lo trata así.
4. **Las plantillas biométricas son datos personales sensibles** bajo la ley mexicana. Consentimiento,
   limitación de finalidad, retención y derechos ARCO son requisitos de la Fase 3, no de la Fase 12.
   Requiere revisión de abogado antes de enrolar a un cliente real.
5. **La vivacidad en web abierta es débil.** Una repetición de alta calidad puede vencer el
   anti-spoofing del navegador. Limita la exposición (tope piloto de $300 MXN, límites de tasa,
   pantalla de confirmación) hasta mover la vivacidad a un SDK comercial o a Android nativo.
6. **Sin SMS/OTP en el MVP.** pey no tiene endpoint de OTP, así que un número es una afirmación sin
   verificar hasta que se paga un push CoDi. Lee `PLAN.md` §1.3 y §10 antes de confiar en un número.

## Licencia

Por definir (propuesta: Apache-2.0 para código, CC-BY-4.0 para docs). No publicar hasta decidir.
