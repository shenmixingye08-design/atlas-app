-- Phase 1-3: Durable Job + Queue entity on top of Phase 1-2 runs.
-- Source of truth: Postgres. process-memory / file queue banned for this path.
-- Rollback: 20260804_atlas_durable_jobs_queue.down.sql
--
-- Retention: with parent run (90d operational). TTL via expires_at.
-- Queue statuses (minimum): queued | leased | running | retry | completed | failed | cancelled | dead_letter
-- Compatibility statuses (WorkQueueStore, no business-logic change):
--   retry_scheduled | waiting_approval | waiting_input | partially_completed

begin;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create table if not exists public.atlas_durable_jobs (
  job_id uuid primary key,
  run_id uuid not null references public.atlas_durable_runs(run_id) on delete cascade,
  owner_id text not null,
  automation_id text,
  occurrence_id uuid references public.atlas_durable_scheduler_occurrences(occurrence_id)
    on delete set null,
  occurrence_key text not null,
  schedule_id text,
  status text not null default 'queued'
    check (status in (
      'queued', 'leased', 'running', 'retry',
      'completed', 'failed', 'cancelled', 'dead_letter',
      -- WorkQueueStore compatibility (mapped at adapter; not new business rules)
      'retry_scheduled', 'waiting_approval', 'waiting_input', 'partially_completed'
    )),
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
  error_message text,
  diagnostic_id text,
  failed_stage text,
  first_error text,
  last_error text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Job / Queue / Occurrence duplicate prevention
  unique (idempotency_key),
  unique (run_id),
  unique (automation_id, occurrence_key)
);

comment on table public.atlas_durable_jobs is
  'Durable Job + Queue SoT (Phase 1-3). Retention: with run (90d). Queue status machine lives here.';

create index if not exists atlas_durable_jobs_job_id_idx
  on public.atlas_durable_jobs (job_id);
create index if not exists atlas_durable_jobs_run_id_idx
  on public.atlas_durable_jobs (run_id);
create index if not exists atlas_durable_jobs_occurrence_id_idx
  on public.atlas_durable_jobs (occurrence_id);
create index if not exists atlas_durable_jobs_status_idx
  on public.atlas_durable_jobs (status, available_at, priority desc);
create index if not exists atlas_durable_jobs_lease_owner_idx
  on public.atlas_durable_jobs (lease_owner)
  where lease_owner is not null;
create index if not exists atlas_durable_jobs_retry_at_idx
  on public.atlas_durable_jobs (retry_at)
  where retry_at is not null;
create index if not exists atlas_durable_jobs_heartbeat_at_idx
  on public.atlas_durable_jobs (heartbeat_at)
  where status in ('leased', 'running');
create index if not exists atlas_durable_jobs_created_at_idx
  on public.atlas_durable_jobs (created_at);
create index if not exists atlas_durable_jobs_updated_at_idx
  on public.atlas_durable_jobs (updated_at);
create index if not exists atlas_durable_jobs_idempotency_key_idx
  on public.atlas_durable_jobs (idempotency_key);

-- Strengthen run uniqueness for idempotent create (run_id already PK).
alter table public.atlas_durable_runs
  add column if not exists idempotency_key text;

create unique index if not exists atlas_durable_runs_idempotency_key_uidx
  on public.atlas_durable_runs (idempotency_key)
  where idempotency_key is not null;

create index if not exists atlas_durable_runs_idempotency_key_idx
  on public.atlas_durable_runs (idempotency_key)
  where idempotency_key is not null;

alter table public.atlas_durable_jobs enable row level security;

drop policy if exists "atlas_durable_jobs_deny" on public.atlas_durable_jobs;
create policy "atlas_durable_jobs_deny"
  on public.atlas_durable_jobs for all to anon, authenticated
  using (false) with check (false);

commit;
