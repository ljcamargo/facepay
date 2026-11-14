# FacePay MX — web (Next.js)

The POS kiosk, the customer onboarding flow, `/mi-cuenta`, and the legal pages.
**No secrets, no pey calls, no face images.** All privileged work goes through Supabase Edge Functions.

## Routes (see `docs/05-ui-screens.md`)

```
src/app/
├── layout.tsx                    # theme provider (light/dark/auto), fonts, toaster
├── page.tsx                      # → /kiosk
├── kiosk/
│   ├── layout.tsx                # device guard, idle timer, wake lock
│   ├── page.tsx                  # today's totals
│   ├── setup/page.tsx            # pairing code
│   ├── checkout/page.tsx         # amount pad + concept
│   ├── identify/page.tsx         # camera + liveness
│   ├── confirm/page.tsx          # "¿Eres …?"
│   ├── fallback/page.tsx         # QR / CoDi QR / manual phone
│   ├── pay/[txId]/page.tsx       # waiting for the bank
│   ├── receipt/[txId]/page.tsx
│   ├── history/page.tsx
│   └── settings/page.tsx         # staff PIN
├── onboarding/[token]/page.tsx   # phone: 4 steps (no OTP)
├── mi-cuenta/page.tsx            # customer self-service
├── legal/[slug]/page.tsx         # react-markdown from legal_documents
└── auth/callback/route.ts        # PKCE exchange
```

State lives in URL params + a small `useCheckout` store (Zustand). No global payment state in React
context, so a refresh never loses a transaction id.

## Conventions

- Server components by default; `"use client"` only for camera, forms, and Realtime.
- All copy from `@facepay/shared/i18n` — no literal Spanish strings in components.
- Amounts: `parseAmountInput()` / `formatMxn()` from `@facepay/shared`; never `Number(x).toFixed(2)`
  for storage.
- Camera logic only through `@facepay/face-engine`; no direct `getUserMedia` in components.
- Realtime hook: `useTransactionStatus(txId)` → subscribes, polls as fallback, exposes `refresh()`.
- Every failure path renders a `<FallbackActions />` (QR / CoDi QR / cancel).

## Commands (after Phase 1)

```bash
bun run dev            # http://localhost:3000/kiosk
bun run build
bun run lint
bun run typecheck
bun run test
```

## Kiosk checklist

- Chrome kiosk mode, landscape, HTTPS (required for `getUserMedia`).
- Wake Lock enabled; auto-return to `/kiosk` after 60 s.
- Pre-warm face models during pairing (service worker cache).
- Verify model files exist under `public/models/human/` and are served with immutable caching.
