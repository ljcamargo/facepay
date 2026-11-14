# 05 — UI: routes, wireframes, copy deck

Design target: **tablet landscape 1280×800** (kiosk) and **phone 390×844** (onboarding).
All user-visible text is **es-MX**. Code identifiers are English.

## 1. Design system

| Token | Value |
| --- | --- |
| Font | `Inter` (UI) + `Inter Tight` or tabular numerals for amounts (`font-variant-numeric: tabular-nums`) |
| Radius | `--radius: 0.75rem` (cards 16 px, buttons 12 px, pills 999 px) |
| Spacing | 4 px scale; kiosk side margins 48 px; touch targets ≥ 56 px |
| Brand | primary = deep teal `#0F766E` (trust, money), accent = lime `#84CC16` (success highlight), destructive = `#DC2626` |
| Theme | `next-themes`, `attribute="class"`, `defaultTheme="system"` → **Claro / Oscuro / Automático** |
| Surfaces | semantic tokens only: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border` |
| Icons | `lucide-react` (outline, 24 px; 32 px in kiosk buttons) |
| Motion | 150–220 ms, `prefers-reduced-motion` respected |
| Numerals | `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` → `$80.00` |

Component library: **shadcn/ui** (Radix primitives, copy-in) + `tailwindcss-animate`.
Custom components: `AmountPad`, `CameraStage`, `LivenessRing`, `MatchCard`, `QrPanel`,
`StatusTimeline`, `ReceiptCard`, `DeviceStatus`, `ThemeToggle`, `BiometricFingerprint`, `Countdown`.

Why shadcn over rippleui: accessible primitives (dialog, focus trap, toasts) come for free, we own the
code, and it is Tailwind-native. RippleUI is a plugin with fewer primitives; not worth a custom
accessibility pass.

## 2. Route map

| Route | Role | Purpose |
| --- | --- | --- |
| `/` | public | Redirect → `/kiosk` (or a tiny landing in Phase 1) |
| `/kiosk/setup` | anon | Pairing code entry; blocked if already paired |
| `/kiosk` | device | Today's totals + "Nueva venta"; idle guard |
| `/kiosk/checkout` | device | Amount + concept |
| `/kiosk/identify` | device | Camera, quality gates, liveness challenge |
| `/kiosk/confirm` | device | "¿Eres …?" — the human check |
| `/kiosk/fallback` | device | 3 escape hatches + register-later |
| `/kiosk/pay/[txId]` | device | Waiting for bank; countdown, cancel, QR |
| `/kiosk/receipt/[txId]` | device | Receipt, auto-return 30 s |
| `/kiosk/history` | device | Today's transactions (staff PIN to go back further) |
| `/kiosk/settings` | staff PIN | Theme, thresholds, device, unpair |
| `/onboarding/[token]` | public | Session landing + the 5-step registration |
| `/mi-cuenta` | customer | Session from this device, consent history, delete biometrics/account |
| `/pay/[txId]` | public (tokenized) | Mobile status page for a push sent from the phone |
| `/legal/about` · `/legal/terms` · `/legal/privacy` | public | Markdown from `legal_documents` |
| `/admin` | staff | Phase 11+: devices, legal docs, transactions export |

Route guards: no device session → `/kiosk/setup`; device revoked → wipe local state + setup;
no consent (customer) → consent step.

## 3. Kiosk wireframes

### 3.1 `/kiosk` — idle / home

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FacePay MX                                         ● En línea    ⚙      │
│                                                                          │
│      Hoy                                                                 │
│      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐               │
│      │  $4,120.00    │ │      37       │ │      2        │               │
│      │  Cobrado      │ │  Pagos        │ │  Pendientes   │               │
│      └───────────────┘ └───────────────┘ └───────────────┘               │
│                                                                          │
│                    ┌──────────────────────────────┐                       │
│                    │      +  Nueva venta          │                       │
│                    └──────────────────────────────┘                       │
│                                                                          │
│  Caja 2 · Sucursal Centro                    Última venta: $80.00 12:04   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 `/kiosk/checkout`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Cancelar                                        Cobrar               │
│                                                                          │
│   Total a cobrar                                                         │
│   $ 80.00                                              ┌───────────────┐  │
│                                                        │      1        │  │
│   Concepto                                             ├───────────────┤  │
│   ┌────────────────────────────┐  ┌──────────────┐     │      2        │  │
│   │ Sin concepto             ▾ │  │ Pedido #     │     ├───────────────┤  │
│   └────────────────────────────┘  └──────────────┘     │      3        │  │
│                                                        ├───────────────┤  │
│   Rápidos   $50   $100   $200   $300                   │      4        │  │
│                                                        ├───────────────┤  │
│                                                        │      5        │  │
│                                                        ├───────────────┤  │
│                                                        │      6        │  │
│                                                        ├───────────────┤  │
│                                                        │      7        │  │
│                                                        ├───────────────┤  │
│                                                        │      8        │  │
│                                                        ├───────────────┤  │
│                                                        │      9        │  │
│                                                        ├───────┬───────┤  │
│                                                        │  00   │   0   │  │
│                                                        ├───────┴───────┤  │
│                                                        │      ⌫        │  │
│                                                        └───────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────┐  ┌───────────────────────────┐ │
│  │        Cobrar con rostro   (▶)       │  │   Otros métodos           │ │
│  └──────────────────────────────────────┘  └───────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Behaviour: amount is a string buffer (`"80.00"` → cents on submit), never a float. `00` and `⌫` for
speed. Submit disabled at `$0.00`. **Concepto is optional**: if it is left empty the server stores the
store name, which is also what the payer sees in their bank app. "Otros métodos" goes straight to `/kiosk/fallback` with the amount
already frozen — the customer who refuses biometrics never has to look at the camera.

### 3.3 `/kiosk/identify`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Cobrar $80.00                                            ✕ Cancelar     │
│                                                                          │
│        ╭───────────────────────────────────╮                             │
│        │                                   │    ◜◝  Mira a la cámara     │
│        │                                   │                             │
│        │            ( live camera )        │    Reto:  parpadea          │
│        │        ╭───────────────╮          │                             │
│        │        │               │          │    ▓▓▓▓▓▓▓▓░░░░  62%        │
│        │        │   face oval   │          │                             │
│        │        │               │          │    ▢ 1 rostro  ▢ luz OK     │
│        │        ╰───────────────╯          │    ▢ frontal   ▢ nitidez OK │
│        │                                   │                             │
│        ╰───────────────────────────────────╯                             │
│                                                                          │
│  Tu rostro no se guarda como foto. Solo calculamos una plantilla         │
│  matemática de 1024 números que no se puede revertir a una imagen.        │
│                                                                          │
│  [ ────────────  Usar QR en su lugar  ──────────── ]                     │
└──────────────────────────────────────────────────────────────────────────┘
```

Inline hints (no modal, no dead end): "Acércate un poco", "Hay más de una persona en cámara",
"Quítate los lentes de sol", "Hay poca luz", "Mantén el rostro quieto", "Mira de frente".
Liveness challenge is randomized per attempt: `parpadea` / `gira lentamente a la derecha` /
`sonríe` / `acércate y aléjate`. Progress ring drives the 3 s capture window; a single frontal frame
at the moment of highest score is used for the embedding.

**Ephemeral vector visualization** (below the camera, optional, hidden after success):

```
  plantilla en memoria  ▁▃▅▂▇█▄▁▂▅▇▃▁▆█▂▄▅▁▃  ·  no se envía a la pantalla
```

It is rendered from the in-memory array as 32 bars, then discarded. The stored template is **never**
sent back to any client. On `/kiosk/confirm` and `/mi-cuenta` we show a deterministic
`BiometricFingerprint` (16×16 grid derived from `sha256(template)`), so the user sees "something is
stored" without holding a copy of the biometric itself.

### 3.4 `/kiosk/confirm`

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                         ╭───────────────────╮                            │
│                         │   ( no photo )    │   nothing from storage     │
│                         ╰───────────────────╯                            │
│                                                                          │
│                              ¿Eres Ana?                                  │
│                     Enviaremos el cobro a •••• 5678                      │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────┐       │
│   │          Sí, enviar solicitud a mi banco                     │       │
│   └──────────────────────────────────────────────────────────────┘       │
│   ┌──────────────────────────────────────────────────────────────┐       │
│   │                     No soy yo                                │       │
│   └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
│   ▦▦▦▦  Huella de tu plantilla · 7f3a9c…    (no es una fotografía)        │
└──────────────────────────────────────────────────────────────────────────┘
```

Why this screen exists: it converts a probabilistic match into a **human-confirmed** claim, catches
the worst false-match case (siblings, twins), and gives an explicit "that's not me" signal that flags
the template for review. It is not a security control, it is a consent + accuracy control.

### 3.5 `/kiosk/fallback`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  No pudimos identificarte. ¿Cómo quieres pagar?          $80.00          │
│                                                                          │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐    │
│  │      ▓▓▓▓▓▓        │ │      ▓▓▓▓▓▓        │ │    📱  →           │    │
│  │      ▓▓QR▓▓        │ │      ▓▓QR▓▓        │ │                    │    │
│  │                    │ │                    │ │  Escribir mi       │    │
│  │  Registrarme y     │ │  Pagar con QR CoDi │ │  celular en mi     │    │
│  │  pagar con mi      │ │  desde mi app      │ │  teléfono          │    │
│  │  rostro            │ │  bancaria          │ │                    │    │
│  │  (2 minutos)       │ │  (más rápido)      │ │  (registro después)│    │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘    │
│                                                                          │
│  ¿Solo quieres pagar? Pídele al cajero otro método.    15:00 → 14:47     │
└──────────────────────────────────────────────────────────────────────────┘
```

The QR for registration encodes `https://app/onboarding/<token>` (session already bound to the
amount). The CoDi QR panel replaces the card in place (no route change) and shows the `qrString`
rendered client-side + "Esperando pago…" state. The third card opens `/onboarding/<token>?mode=pay`
which skips enrollment entirely: phone + consent → push → "puedes registrarte después".

### 3.6 `/kiosk/pay/[txId]` — waiting for the bank

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                         ◜◝  Esperando a tu banco                        │
│                                                                          │
│            Enviamos una solicitud de $80.00 a •••• 5678                  │
│                                                                          │
│            Abre la app de tu banco y aprueba el cobro CoDi.              │
│                        No cierres esta pantalla.                         │
│                                                                          │
│                 ██████████████████████░░░░░░░░   05:12                   │
│                                                                          │
│   ┌──────────────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│   │  Ya pagué, actualizar│ │   Cancelar   │ │     Usar QR          │    │
│   └──────────────────────┘ └──────────────┘ └──────────────────────┘    │
│                                                                          │
│   ¿No llega? Algunos bancos tardan hasta 1 minuto en mostrarla.          │
└──────────────────────────────────────────────────────────────────────────┘
```

States: `connecting` → `waiting` → (`paid` | `expired` | `cancelled` | `error`). On `paid`, 600 ms
celebration then receipt. Sound: subtle chime on paid (mutable in settings). Screen stays awake
(Wake Lock API, fallback: hidden looping video).

### 3.7 `/kiosk/receipt/[txId]`

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              ✓  Pago recibido                           │
│                                                                          │
│                                 $80.00                                   │
│                          Pedido #123 · 12:04:51                          │
│                                                                          │
│   Folio                 A-000137                                          │
│   Método                CoDi · confirmado por tu banco                   │
│   Banco del pagador     40012 · CLABE •••• 8842                          │
│   Referencia Banxico    12345678901234567890                             │
│                                                                          │
│   ┌────────────────────────────┐   ┌──────────────────────────────────┐  │
│   │      Nueva venta           │   │      Imprimir / compartir        │  │
│   └────────────────────────────┘   └──────────────────────────────────┘  │
│                                                                          │
│   Volviendo al inicio en 30 s…                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.8 `/kiosk/setup` — pairing

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Configurar esta tablet                            │
│                                                                          │
│   1. En tu celular, entra a  facepay.mx/admin  →  Dispositivos           │
│   2. Genera un código de emparejamiento                                  │
│   3. Escríbelo aquí                                                      │
│                                                                          │
│                    ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│                    │ 4  │ │ 8  │ │ 2  │ │ 9  │ │ 1  │ │ 3  │            │
│                    └────┘ └────┘ └────┘ └────┘ └────┘ └────┘            │
│                                                                          │
│                           [  Emparejar  ]                                │
│                                                                          │
│   El código expira en 10 minutos. Este dispositivo no tiene acceso a     │
│   datos de otras sucursales.                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.9 `/kiosk/settings` (PIN-gated)

Theme (Claro / Oscuro / Automático) · device name/store (read-only) · identification thresholds
slider (0.55–0.80) with a warning label · max amount for face payments · manual phone entry toggle ·
sound toggle · unpair device (double confirm) · app version + last heartbeat.

## 4. Phone wireframes — `/onboarding/[token]`

One route, **4 steps**, progress bar, state kept in memory. No OTP: the number is a claim until the
customer pays a CoDi push, and the pixel that proves intent is the consent checkbox, not a code.

```
① Tu número              ② Consentimiento           ③ Tu rostro           ④ Listo
┌──────────────────┐    ┌──────────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ ●○○○             │    │ ●●○○                     │ │ ●●●○             │ │ ●●●●             │
│ Paga $80.00      │    │ Antes de continuar       │ │  ╭────────────╮  │ │        ✓         │
│ en Café Centro   │    │                          │ │  │  ( selfie )│  │ │  Ya estás        │
│                  │    │ • Guardamos una plantilla│ │  │   ◯ guía   │  │ │  registrado      │
│ Celular a 10     │    │   matemática, no fotos.  │ │  ╰────────────╯  │ │                  │
│ dígitos          │    │ • Se usa solo para       │ │                  │ │  Ana · •••• 5678 │
│ ┌──────────────┐ │    │   identificarte y cobrar.│ │ Reto: gira a la  │ │                  │
│ │ 55 1234 5678 │ │    │ • Puedes borrarla cuando │ │ derecha          │ │ [ Pagar $80.00 ] │
│ └──────────────┘ │    │   quieras.               │ │ ▓▓▓▓▓▓░░ 70%     │ │                  │
│                  │    │ • No es obligatorio:     │ │                  │ │ O paga en la     │
│ [  Continuar  ]  │    │   puedes pagar con QR.   │ │ [ Detener ]      │ │ tablet con QR    │
│                  │    │                          │ │                  │ │                  │
│ Lo usamos para   │    │ ☑ Acepto el Aviso de     │ │ Solo en tu       │ │ Este celular     │
│ enviarte el      │    │   Privacidad y doy mi    │ │ celular. El      │ │ quedó vinculado  │
│ cobro CoDi y     │    │   consentimiento expreso │ │ kiosco no guarda │ │ a tu rostro.     │
│ avisarte si hay  │    │   para datos biométricos.│ │ tu rostro.       │ │                  │
│ un problema.     │    │ [  Ver aviso completo  ] │ │                  │ │                  │
│                  │    │ [ Aceptar y seguir     ] │ │                  │ │                  │
└──────────────────┘    └──────────────────────────┘ └──────────────────┘ └──────────────────┘
```

Rules that are not negotiable in this flow:

- The privacy notice and the biometric consent are shown **before** the camera opens. Consent is a
  separate checkbox, not bundled with "Continuar".
- The selfie and the liveness challenge happen on this device only. The kiosk never sends the
  customer's face here (post-MVP optimization, `PLAN.md` §3.2).
- Step ① explains why the number is needed; the copy never says "verificaremos tu número" because we
  do not.
- `?mode=pay` skips step ③ entirely: number → consent to receive a push → done. That is the path for
  people who refuse biometrics.

Step ③ reuses the exact same `face-engine` as the kiosk (same model, same thresholds), so enrollment
and identification stay comparable. On success the page sends the push and shows the waiting state
inline, then "Listo, muestra esta pantalla al cajero".

## 5. Legal pages

`/legal/about`, `/legal/terms`, `/legal/privacy` render Markdown from `legal_documents` with
`react-markdown` + `remark-gfm`, styled with `@tailwindcss/typography` (`prose dark:prose-invert`).
Header shows `Versión 2026-11-14` and "Última actualización". A sticky table of contents on the right
(desktop) / collapsible (mobile). `BiometricFingerprint` + a plain-language summary box at the top of
privacy ("En 30 segundos: …"). Links from the consent checkbox open privacy in a new tab so the form
state is not lost.

## 6. Copy deck (es-MX)

| Key | Text |
| --- | --- |
| `kiosk.checkout.title` | Cobrar |
| `kiosk.checkout.total` | Total a cobrar |
| `kiosk.checkout.concept` | Concepto |
| `kiosk.checkout.noConcept` | Sin concepto |
| `kiosk.checkout.order` | Pedido # |
| `kiosk.checkout.quick` | Rápidos |
| `kiosk.checkout.conceptOptional` | Concepto (opcional) |
| `kiosk.checkout.conceptHint` | Si lo dejas vacío usamos el nombre de la tienda. |
| `kiosk.checkout.face` | Cobrar con rostro |
| `kiosk.checkout.other` | Otros métodos |
| `kiosk.identify.look` | Mira a la cámara |
| `kiosk.identify.challenge.blink` | Reto: parpadea |
| `kiosk.identify.challenge.right` | Reto: gira lentamente a la derecha |
| `kiosk.identify.challenge.smile` | Reto: sonríe |
| `kiosk.identify.privacy` | Tu rostro no se guarda como foto. Solo calculamos una plantilla matemática de 1024 números que no se puede revertir a una imagen. |
| `kiosk.identify.useQr` | Usar QR en su lugar |
| `kiosk.identify.hint.far` | Acércate un poco |
| `kiosk.identify.hint.multiple` | Hay más de una persona en cámara |
| `kiosk.identify.hint.dark` | Hay poca luz |
| `kiosk.identify.hint.still` | Mantén el rostro quieto |
| `kiosk.identify.hint.center` | Mira de frente |
| `kiosk.confirm.title` | ¿Eres {name}? |
| `kiosk.confirm.send` | Enviaremos el cobro a {phone} |
| `kiosk.confirm.yes` | Sí, enviar solicitud a mi banco |
| `kiosk.confirm.no` | No soy yo |
| `kiosk.fallback.title` | No pudimos identificarte. ¿Cómo quieres pagar? |
| `kiosk.fallback.register` | Registrarme y pagar con mi rostro |
| `kiosk.fallback.registerTime` | (2 minutos) |
| `kiosk.fallback.codiQr` | Pagar con QR CoDi desde mi app bancaria |
| `kiosk.fallback.codiQrTime` | (más rápido) |
| `kiosk.fallback.phone` | Escribir mi celular en mi teléfono |
| `kiosk.fallback.phoneTime` | (registro después) |
| `kiosk.fallback.store` | ¿Solo quieres pagar? Pídele al cajero otro método. |
| `kiosk.wait.title` | Esperando a tu banco |
| `kiosk.wait.sent` | Enviamos una solicitud de {amount} a {phone} |
| `kiosk.wait.instruction` | Abre la app de tu banco y aprueba el cobro CoDi. |
| `kiosk.wait.keepOpen` | No cierres esta pantalla. |
| `kiosk.wait.check` | Ya pagué, actualizar |
| `kiosk.wait.cancel` | Cancelar |
| `kiosk.wait.useQr` | Usar QR |
| `kiosk.wait.slow` | ¿No llega? Algunos bancos tardan hasta 1 minuto en mostrarla. |
| `kiosk.receipt.title` | Pago recibido |
| `kiosk.receipt.folio` | Folio |
| `kiosk.receipt.method` | Método |
| `kiosk.receipt.bank` | Banco del pagador |
| `kiosk.receipt.ref` | Referencia Banxico |
| `kiosk.receipt.new` | Nueva venta |
| `kiosk.receipt.print` | Imprimir / compartir |
| `kiosk.receipt.return` | Volviendo al inicio en {s} s… |
| `kiosk.error.peyDown` | El servicio de cobro no está disponible en este momento. |
| `kiosk.error.noCodi` | Ese número no tiene CoDi activo en su banco. |
| `kiosk.error.timeout` | No recibimos confirmación de tu banco. |
| `onboarding.phone.title` | Tu celular a 10 dígitos |
| `onboarding.phone.help` | Con tu número enviamos el cobro CoDi. |
| `onboarding.done.linked` | Este celular quedó vinculado a tu rostro. |
| `onboarding.consent.title` | Antes de continuar |
| `onboarding.consent.p1` | Guardamos una plantilla matemática, no fotos. |
| `onboarding.consent.p2` | Se usa solo para identificarte y cobrar. |
| `onboarding.consent.p3` | Puedes borrarla cuando quieras. |
| `onboarding.consent.p4` | No es obligatorio: puedes pagar con QR. |
| `onboarding.consent.checkbox` | Acepto el Aviso de Privacidad y doy mi consentimiento expreso para datos biométricos. |
| `onboarding.consent.read` | Ver aviso completo |
| `onboarding.consent.accept` | Aceptar y seguir |
| `onboarding.face.title` | Mira la cámara |
| `onboarding.face.capture` | Capturar |
| `onboarding.done.title` | Ya estás registrado |
| `onboarding.done.pay` | Pagar {amount} |
| `onboarding.done.qr` | O paga en la tablet con QR |
| `common.cancel` | Cancelar |
| `common.retry` | Reintentar |
| `common.back` | Regresar |
| `common.close` | Cerrar |
| `common.disclosure` | El rostro solo identifica. El pago lo autorizas en tu banco. |
| `kiosk.confirm.disclosure` | No autorizamos cobros. Tu banco pide tu aprobación. |
| `onboarding.phone.help` | Lo usamos para enviarte el cobro CoDi y avisarte si hay un problema. |
| `onboarding.face.local` | Solo en tu celular. El kiosco no guarda tu rostro. |
| `common.loading` | Un momento… |
| `common.error` | Algo salió mal |
| `theme.label` | Tema |
| `theme.light` | Claro |
| `theme.dark` | Oscuro |
| `theme.auto` | Automático |

Tone: second person, no exclamation marks, no "biometría" in customer-facing copy unless the legal
text demands it (use "plantilla matemática" / "tu rostro"). Never say "pago seguro" or imply the face
protects the money.

## 7. Accessibility & kiosk hardening

- Contrast ≥ 4.5:1 in both themes; focus rings visible; all icon buttons have `aria-label` in Spanish.
- Amount announced via `aria-live="polite"`; errors as `role="alert"`.
- `prefers-reduced-motion` disables the ring animation and the receipt celebration.
- Camera is never the only path: the QR fallback is reachable in one tap from every screen.
- Kiosk: Chrome kiosk mode, `overscroll-behavior: none`, no text selection, no zoom, Wake Lock,
  auto-return to `/kiosk` after 60 s idle, hidden 5-tap-logo gesture for `/kiosk/settings` + staff PIN,
  and a "revoked device" state that wipes the session and shows the pairing screen.
- Offline: a service worker caches the app shell + face models (~35 MB) so a flaky connection does not
  break identification; payments still require network and show an explicit offline banner.
