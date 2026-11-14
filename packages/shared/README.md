# `@facepay/shared`

Single source of truth for anything used by more than one app (web today, Android later).

## Contents (Phase 1+)

```
src/
├── i18n/es.ts          # typed copy deck — the ONLY place with Spanish strings
├── money.ts            # cents <-> string <-> pey number; formatMxn()
├── phone.ts            # normalize to E.164 (+52), mask (•••• 5678), validate 10 digits
├── types.ts            # Transaction, FaceTemplate, OnboardingSession, enums
├── schemas.ts          # zod schemas for every HTTP body and webhook payload
├── constants.ts        # thresholds, caps, TTLs, status lists
└── result.ts           # Result<T, E> helper used by the Edge Functions
```

## Rules

- Zero runtime dependencies except `zod`. It must be importable from browser, Node, and Deno.
- No `process.env` reads, no Supabase client, no `fetch`.
- Money never leaves this module as a float: `centsToPeyAmount(8000) === 80`.
- Phone: `toE164Mx('55 1234 5678') === '+525512345678'`; `toPeyPhone('+525512345678') === '5512345678'`
  (that difference is the #1 integration bug — test it).
- Status enums are the DB enums; keep them in sync with `supabase/migrations`.
- Copy keys are typed: a missing or renamed key is a compile error, not a runtime blank.
