-- Extensions used by FacePay MX.
-- pgvector: face templates (1024-d embeddings) and the HNSW index.
-- pgcrypto: gen_random_uuid() on older Postgres images.
-- pg_cron / pg_net are added in Phase 11 together with the reconciliation job.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;
