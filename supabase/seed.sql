-- Local seed. Runs on every `supabase db reset`; safe to re-run.
-- No real phone numbers, no staff passwords, no devices with credentials.

insert into public.stores (id, name, legal_name, address, timezone, pilot_limit_cents)
values (
  '00000000-0000-0000-0000-000000000001',
  'Café Centro',
  null,   -- legal_name: filled when the merchant entity exists
  null,   -- address
  'America/Mexico_City',
  30000
)
on conflict (id) do nothing;

-- Legal text lives in apps/web/content/legal/*.md for now (single source, rendered
-- by the app). Phase 3 copies the accepted versions into legal_documents so the
-- hash in biometric_consents points at an immutable row.
--
-- Staff and devices are intentionally NOT seeded: they need auth.users rows, which
-- only the Auth API should create. Pair a kiosk from /kiosk/setup once an owner
-- account exists.
