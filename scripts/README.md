# scripts/

Operational and development helpers. Run with `pnpm tsx scripts/<name>.ts`. Nothing here runs in
production automatically.

| Script | Phase | Purpose |
| --- | --- | --- |
| `sync-models.ts` | 4 | Copy the `@vladmandic/human` model files into `apps/web/public/models/human/` and print checksums |
| `calibrate.ts` | 4 | Sweep thresholds over a local, consented image set → FAR/FRR report (no images committed) |
| `make-fixtures.ts` | 9 | Build webhook fixtures with valid Standard Webhooks signatures for tests |
| `reconcile.ts` | 11 | Manual reconciliation against pey (`GET /transaction/{id}`) for support |
| `check-secrets.ts` | 11 | Fail if `service_role`, `PEY_`, or `whsec_` appear in the built client bundle |
| `new-phase.ts` | 1 | Scaffold a phase note in `MEMOIRS.md` (optional) |

## Rules

- No script may print a full phone number, a CLABE, or an API key. Mask everything.
- Scripts that call pey must prompt for confirmation and default to `$0.01` amounts.
- `calibrate.ts` reads a local folder that is gitignored; it stores only aggregate numbers.
