-- P0-6: Durable Automation Engine
-- V1 definitions + execution history as row SoT (separate from V2 atlas_automations).
-- SAFE: does not drop V1 atlas_user_state blob or V2 tables.
-- Production auto-apply is intentionally NOT enabled by application code.

-- ---------------------------------------------------------------------------
-- Definitions (schedule / pause / resume / retry metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_automation_definitions (
  id text primary key,
  owner_user_id text not null,
  organization_id text,
  title text not null,
  status text not null
    check (status in ('idle', 'running', 'success', 'failed', 'paused', 'archived')),
  enabled boolean not null default true,
  paused boolean not null default false,
  schedule_kind text not null default 'schedule',
  schedule_cron text,
  schedule_timezone text,
  schedule_label text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  definition jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists atlas_automation_definitions_owner_idx
  on public.atlas_automation_definitions (owner_user_id)
  where deleted_at is null;

create index if not exists atlas_automation_definitions_owner_enabled_idx
  on public.atlas_automation_definitions (owner_user_id, enabled)
  where deleted_at is null;

create index if not exists atlas_automation_definitions_next_run_idx
  on public.atlas_automation_definitions (next_run_at)
  where deleted_at is null and enabled = true and paused = false;

create index if not exists atlas_automation_definitions_org_idx
  on public.atlas_automation_definitions (organization_id)
  where deleted_at is null and organization_id is not null;

create index if not exists atlas_automation_definitions_pause_idx
  on public.atlas_automation_definitions (owner_user_id, paused, enabled)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Execution history (completion evidence / retry trail)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_automation_executions (
  id text primary key,
  automation_id text not null,
  owner_user_id text not null,
  organization_id text,
  status text not null
    check (status in (
      'queued',
      'running',
      'success',
      'failed',
      'cancelled',
      'awaiting_approval',
      'skipped',
      'retry_scheduled'
    )),
  trigger_type text not null default 'automation',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  work_queue_job_id text,
  workflow_run_id text,
  idempotency_key text,
  occurrence_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_automation_executions_automation_fk
    foreign key (automation_id)
    references public.atlas_automation_definitions (id)
    on delete cascade
);

create unique index if not exists atlas_automation_executions_idempotency_uidx
  on public.atlas_automation_executions (automation_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists atlas_automation_executions_occurrence_uidx
  on public.atlas_automation_executions (occurrence_key)
  where occurrence_key is not null;

create index if not exists atlas_automation_executions_owner_created_idx
  on public.atlas_automation_executions (owner_user_id, created_at desc);

create index if not exists atlas_automation_executions_automation_created_idx
  on public.atlas_automation_executions (automation_id, created_at desc);

create index if not exists atlas_automation_executions_retry_idx
  on public.atlas_automation_executions (status, next_retry_at)
  where status = 'retry_scheduled';

create index if not exists atlas_automation_executions_org_idx
  on public.atlas_automation_executions (organization_id)
  where organization_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: deny anon/authenticated; service role only
-- ---------------------------------------------------------------------------
alter table public.atlas_automation_definitions enable row level security;
alter table public.atlas_automation_executions enable row level security;

drop policy if exists "atlas_automation_definitions_deny_anon"
  on public.atlas_automation_definitions;
create policy "atlas_automation_definitions_deny_anon"
  on public.atlas_automation_definitions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_automation_executions_deny_anon"
  on public.atlas_automation_executions;
create policy "atlas_automation_executions_deny_anon"
  on public.atlas_automation_executions
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_automation_definitions is
  'P0-6 Durable Automation Engine — V1 definition SoT (schedule/pause/resume/retry).';
comment on table public.atlas_automation_executions is
  'P0-6 Durable Automation Engine — execution history / completion evidence.';
