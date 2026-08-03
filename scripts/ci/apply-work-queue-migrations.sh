#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"

# Supabase roles may be absent in plain Postgres CI — create stubs for RLS policies.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260802_atlas_work_queue.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260803_atlas_work_queue_reliability.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260804_atlas_scheduler_registry.sql
echo "work-queue + scheduler registry migrations applied"
