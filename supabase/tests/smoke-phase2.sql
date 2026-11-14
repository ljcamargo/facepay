-- Phase 2 smoke test — READ ONLY. Paste into the Supabase SQL Editor and run.
-- Expected values are commented next to each block. Nothing is written.

-- 1) Inventory ---------------------------------------------------------------
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE') as tables,        -- 14
  (select count(*) from information_schema.views
     where table_schema = 'public') as views,                                       -- 1
  (select count(*) from supabase_migrations.schema_migrations) as migrations,       -- 8
  (select count(*) from public.stores) as stores;                                   -- 1

-- 2) Seed --------------------------------------------------------------------
select id, name, pilot_limit_cents, template_expiry_enabled, face_payments_enabled
from public.stores;
-- 00000000-0000-0000-0000-000000000001 | Café Centro | 30000 | false | true

-- 3) RLS is on everywhere ----------------------------------------------------
select
  count(*) filter (where c.relrowsecurity) as tables_with_rls,                      -- 14
  count(*) as tables_total                                                          -- 14
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- 4) Tables that intentionally have NO policies (service_role only) ----------
select c.relname as no_client_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by 1;
-- face_templates, payment_events, rate_limits

-- 5) Grants, as seen by each role (no role switching needed) -----------------
select
  has_table_privilege('anon', 'public.transactions', 'select')            as anon_reads_tx,          -- false
  has_table_privilege('anon', 'public.face_templates', 'select')          as anon_reads_templates,   -- false
  has_table_privilege('authenticated', 'public.face_templates', 'select') as auth_reads_templates,   -- false
  has_table_privilege('authenticated', 'public.face_templates_public', 'select') as auth_reads_view; -- true

-- 6) The only matching path: identify_customer -------------------------------
-- A random vector must not match anyone. Returns one row, decision = no_match.
select decision, customer_id, display_name, phone_masked, similarity, margin
from public.identify_customer(
  ('[' || array_to_string(array_fill('0.01'::text, array[1024]), ',') || ']')::extensions.vector,
  'human-hse-faceres', 0.6::real, 0.08::real, null::uuid
);

-- 7) Vector index ------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'face_templates';
-- face_templates_embedding_idx ... USING hnsw (embedding extensions.vector_cosine_ops)
--   WHERE (revoked_at IS NULL)

-- 8) Policies actually installed ---------------------------------------------
select tablename, cmd, policyname
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
