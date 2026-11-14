# AGENTS.md — collaboration contract

Rules for **any** contributor: human, AI agent, or pair of both. Read this before touching the repo.
Read `PLAN.md` for scope, `docs/10-decisions.md` for the *why*, `MEMOIRS.md` for recent context.

---

## 1. Non-negotiables

1. **No secrets in the repo.** Ever. `.env*` except `.env.example` is gitignored. Supabase
   `service_role` key, `pey` API key, webhook secret and cron secret live only in Supabase secrets /
   Netlify env vars. If you find one committed, stop, rotate it, and log it in `MEMOIRS.md`.
2. **The browser never holds a server secret, a biometric template, or a raw `pey` key.**
   The web app only has `NEXT_PUBLIC_SUPABASE_URL` + anon key.
3. **Faces are identification only.** No code path may treat a face match as authorization for money.
   If a task seems to require that, it is a design change → ADR first.
4. **No raw face images are persisted.** Not in Postgres, not in Storage, not in logs, not in error
   reports. Embeddings only. (A future opt-in encrypted thumbnail is an ADR, not a refactor.)
5. **Spanish UI, English code.** Identifiers, table/column names, commit messages, comments, docs: English.
   All user-visible strings: es-MX, centralized in `packages/shared/src/i18n/es.ts` (typed keys).
   Markdown docs: English, except `README.es.md` and `docs/*.es.md` when they exist.
6. **Every schema change ships as a migration** in `supabase/migrations/<timestamp>_<snake_name>.sql`.
   Never edit an applied migration. Never `ALTER` a live DB by hand.
7. **RLS is on for every table** (`alter table ... enable row level security`) in the same migration
   that creates it. A table without policies must have zero grants to `anon`/`authenticated`.
8. **Money is integer cents** (`amount_cents integer`). Floats are a bug. Format only at the UI edge.
9. **Idempotency is mandatory** for anything that costs money or writes an event: `idempotency_key`
   on transactions, `webhook_id UNIQUE` on payment events.
10. **Update the bitácora.** Any merged change appends to `MEMOIRS.md`. A change without a record is
    considered lost context.
11. **CoDi only.** No cards, Apple/Google Pay, payment links, Stripe, refunds or tipping in this scope.
    Adding one is an ADR, not a pull request.
12. **The kiosk never enrolls a face.** Signup happens on the customer's device, after the notice. The
    kiosk's identification embedding is transient: never persisted, never forwarded.
13. **No SMS/OTP in the MVP.** A `phone_e164` is an unverified claim (`phone_verified_at` null) until
    a CoDi push is paid. Never treat it as verified, never use it for account recovery or linkage.
14. **`PLAN.md` and `PLAN.es.md` change together**, in the same commit. A one-sided plan edit is a bug.

## 2. Where things live (ownership map)

| Area | Path | Rule |
| --- | --- | --- |
| Planning | `PLAN.md`, `docs/` | Change requires an ADR entry + note in `MEMOIRS.md` |
| Web UI | `apps/web/src/app`, `components` | Follow `docs/05-ui-screens.md`; no copy invention without updating the copy deck |
| Shared types/i18n | `packages/shared` | Single source of truth; breaking changes bump and touch all consumers in the same PR |
| pey client | `packages/pey-client` | **Server-only.** Must not import browser globals. Never log the API key |
| Face engine | `packages/face-engine` | Pure browser. Must degrade: if models fail to load, UI falls back to QR |
| DB | `supabase/migrations` | Additive-first; destructive changes need a two-phase plan |
| Edge Functions | `supabase/functions` | One folder per function, `index.ts` + `_shared/` helpers only |
| Android | `apps/android` | Own README; must not fork domain logic from `packages/shared` |

**Parallel work:** if two agents must touch the same file, one of them claims it first in a message
("claiming `supabase/migrations/…`"). Claimed files are not edited by others until release.

## 3. Conventions

- **Branches:** `feat/<phase>-<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
- **Commits:** Conventional Commits, English, imperative, scope optional:
  `feat(kiosk): amount pad with quick amounts` · `fix(webhook): reject stale timestamps`.
  Phase prefixes help review: `feat(p7): …`.
- **Phases:** one phase = one PR-sized series. Do not start Phase *n+1* code while Phase *n*
  acceptance criteria are unmet. Docs may lead code.
- **TypeScript:** `strict`, no `any` in exported signatures, no `// @ts-ignore` without a comment
  explaining why. Prefer `zod` schemas at every trust boundary (HTTP in, webhook in, DB out).
- **React:** server components by default; `"use client"` only where you need camera/state/effects.
  No `useEffect` data fetching when a server action or Realtime subscription fits.
- **Styling:** Tailwind utilities + shadcn primitives. No new UI library without an ADR.
  Use semantic tokens (`bg-background`, `text-muted-foreground`) so light/dark/auto works everywhere.
- **Errors:** user-facing copy in Spanish, technical detail in English logs with a `requestId`.
  Never surface provider error text raw to a customer.
- **Comments:** only where intent is not obvious; English; explain *why*, not *what*.
- **Tests:** colocated `*.test.ts` for pure logic; RLS and webhook tests under `supabase/tests`.
  Every bug fix gets a regression test or a documented reason why it cannot have one.
- **No new dependency** without: (a) a one-line justification in the PR, (b) license check
  (MIT/Apache/BSD/ISC ok; AGPL/GPL needs approval; no unlicensed packages), (c) size sanity check.

## 4. Order of operations for a phase

1. Read `PLAN.md` phase row + the relevant `docs/*` page. Restate the acceptance criteria.
2. Check `MEMOIRS.md` for the last known state (it may contradict a stale doc — trust the log).
3. If a decision is needed: write the ADR **first**, get a yes, then code.
4. Implement in vertical slices: DB → function → UI → failure path → test.
5. Verify: `pnpm lint && pnpm typecheck && pnpm test`. For DB: `pnpm supabase db reset` from scratch.
6. Manually run the phase's demo script (`docs/12-testing.md`) and paste the result in the note.
7. Append to `MEMOIRS.md`, update the phase table in `PLAN.md` (status only), commit.

## 5. Handoff / delegation protocol (multi-agent)

When an agent hands work to another agent (or to you):

- Include: **what** was done, **what is left**, **files touched**, **how to verify**, **known traps**.
- Never hand off work you have not typechecked. "It should work" is not a handoff.
- If a subordinate is about to do something unsafe (secrets in code, dropping a table, disabling RLS,
  committing a face image), **interrupt it immediately** rather than fixing it afterwards.
- Re-read `MEMOIRS.md` before acting on a message older than the last entry.

Template (copy into your message or `MEMOIRS.md`):

```
HANDOFF
from: <agent/filename>
phase: <n> — <name>
done: <bullets>
left: <bullets, ordered>
touched: <paths>
verify: <exact commands + expected result>
traps: <bullets>
```

## 6. Safety valves

- **Do not** run `supabase db push` against a project you did not create without explicit approval.
- **Do not** send more than 5 real `$0.01` pey requests per session without asking.
- **Do not** "fix" a failing RLS test by adding `using (true)`.
- **Do not** disable liveness or thresholds to make a demo pass. Log the failure instead.
- **Do not** rewrite history on `main` / the protected branch.
- **Do not** touch `apps/android` beyond its README unless the user opens that phase.

## 7. Definition of "ready for review"

- [ ] Acceptance criteria of the phase are met and demonstrated
- [ ] `lint`, `typecheck`, `test` green; `db reset` clean
- [ ] Failure paths implemented (not `console.error` placeholders)
- [ ] Spanish copy reviewed; no hardcoded strings outside the i18n file
- [ ] RLS verified from a second identity (device vs customer vs anon)
- [ ] No secrets, no `service_role` in client bundle (`pnpm build` + grep the output)
- [ ] `MEMOIRS.md` entry added; docs updated if behaviour changed
- [ ] New dependency justified; license OK
