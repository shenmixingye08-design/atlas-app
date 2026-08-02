-- Automation Platform V2 foundation tables.
-- SAFE: does not drop or alter V1 atlas_user_state / atlas_automation_jobs.
-- Production auto-apply is intentionally NOT enabled by application code.
-- Apply manually after backup + dry-run migration report.

-- Definitions
create table if not exists public.atlas_automations (
  id uuid primary key,
  user_id text not null,
  name text not null,
  description text not null default '',
  status text not null check (status in ('draft', 'active', 'paused', 'disabled', 'archived')),
  trigger jsonb not null,
  workflow jsonb not null,
  execution_policy jsonb not null,
  notification_policy jsonb not null,
  instruction jsonb not null,
  memory_policy jsonb not null,
  legacy_automation_id text,
  schema_version integer not null default 2,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists atlas_automations_legacy_id_uidx
  on public.atlas_automations (legacy_automation_id)
  where legacy_automation_id is not null;

create index if not exists atlas_automations_user_status_idx
  on public.atlas_automations (user_id, status);

create index if not exists atlas_automations_next_run_idx
  on public.atlas_automations (next_run_at)
  where status = 'active';

-- Runs (separated from definitions)
create table if not exists public.atlas_automation_runs (
  id uuid primary key,
  automation_id uuid not null references public.atlas_automations (id),
  user_id text not null,
  status text not null,
  run_key text not null,
  idempotency_key text not null,
  schedule_occurrence_key text,
  trigger_type text not null,
  scheduled_for timestamptz,
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error_code text,
  last_error_message text,
  resolved_instruction jsonb,
  memory_references jsonb not null default '[]'::jsonb,
  status_history jsonb not null default '[]'::jsonb,
  approval_expires_at timestamptz,
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create unique index if not exists atlas_automation_runs_occurrence_uidx
  on public.atlas_automation_runs (schedule_occurrence_key)
  where schedule_occurrence_key is not null;

create unique index if not exists atlas_automation_runs_run_key_uidx
  on public.atlas_automation_runs (run_key);

create index if not exists atlas_automation_runs_user_automation_idx
  on public.atlas_automation_runs (user_id, automation_id, created_at desc);

-- Migration id map (old → new) for idempotent re-runs
create table if not exists public.atlas_automation_migration_map (
  legacy_automation_id text primary key,
  automation_id uuid not null references public.atlas_automations (id),
  migrated_at timestamptz not null default now(),
  mode text not null default 'apply',
  notes text
);

-- RLS: deny anon/authenticated; service role only
alter table public.atlas_automations enable row level security;
alter table public.atlas_automation_runs enable row level security;
alter table public.atlas_automation_migration_map enable row level security;

drop policy if exists "atlas_automations_deny_anon" on public.atlas_automations;
create policy "atlas_automations_deny_anon"
  on public.atlas_automations
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_automation_runs_deny_anon" on public.atlas_automation_runs;
create policy "atlas_automation_runs_deny_anon"
  on public.atlas_automation_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_automation_migration_map_deny_anon" on public.atlas_automation_migration_map;
create policy "atlas_automation_migration_map_deny_anon"
  on public.atlas_automation_migration_map
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- NOTE: Data backfill is performed by application migration (dry-run/apply),
-- never by this SQL file. Existing atlasAutomations JSON remains the V1 source.
