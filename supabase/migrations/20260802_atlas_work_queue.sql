-- Durable work queue for Scheduler / Worker (MINERVOT).
-- Source of truth: Postgres. Not process memory.
-- Lease via FOR UPDATE SKIP LOCKED (see lib/work-queue/store/postgres.ts).
-- Apply manually / via migration action after backup.

create table if not exists public.atlas_work_queue_jobs (
  job_id uuid primary key,
  run_id text not null,
  automation_id text,
  owner_id text not null,
  occurrence_key text not null,
  schedule_id text,
  status text not null default 'queued',
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  retry_at timestamptz,
  error_code text,
  failed_stage text,
  diagnostic_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  first_error text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (automation_id, occurrence_key)
);

create index if not exists atlas_work_queue_jobs_lease_idx
  on public.atlas_work_queue_jobs (status, available_at, priority desc)
  where status in ('queued', 'retry_scheduled');

create index if not exists atlas_work_queue_jobs_stuck_idx
  on public.atlas_work_queue_jobs (heartbeat_at)
  where status in ('leased', 'running');

create index if not exists atlas_work_queue_jobs_owner_idx
  on public.atlas_work_queue_jobs (owner_id, status);

create table if not exists public.atlas_work_queue_steps (
  step_id text not null,
  job_id uuid not null references public.atlas_work_queue_jobs(job_id) on delete cascade,
  step_index integer not null,
  step_type text not null,
  status text not null default 'pending',
  attempt integer not null default 0,
  input_bindings jsonb not null default '{}'::jsonb,
  output_bindings jsonb not null default '{}'::jsonb,
  artifact_ids jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, step_id),
  unique (idempotency_key)
);

create index if not exists atlas_work_queue_steps_job_idx
  on public.atlas_work_queue_steps (job_id, step_index);

alter table public.atlas_work_queue_jobs enable row level security;
alter table public.atlas_work_queue_steps enable row level security;

drop policy if exists "atlas_work_queue_jobs_deny" on public.atlas_work_queue_jobs;
create policy "atlas_work_queue_jobs_deny"
  on public.atlas_work_queue_jobs for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_work_queue_steps_deny" on public.atlas_work_queue_steps;
create policy "atlas_work_queue_steps_deny"
  on public.atlas_work_queue_steps for all to anon, authenticated
  using (false) with check (false);
