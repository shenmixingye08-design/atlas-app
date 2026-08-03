-- Phase 1-4: Durable Lease / Heartbeat / Recovery fencing.
-- Rollback: 20260805_atlas_durable_lease_recovery.down.sql
--
-- Adds leaseToken/leaseVersion fencing on jobs + durable lease/heartbeat columns,
-- and a job-scoped recovery ledger (not retry-as-recovery).

begin;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Job-row fencing columns (Work Queue SoT)
-- ---------------------------------------------------------------------------
alter table public.atlas_durable_jobs
  add column if not exists lease_token text;
alter table public.atlas_durable_jobs
  add column if not exists lease_version integer not null default 0;
alter table public.atlas_durable_jobs
  add column if not exists worker_instance_id text;
alter table public.atlas_durable_jobs
  add column if not exists worker_started_at timestamptz;

create index if not exists atlas_durable_jobs_lease_token_idx
  on public.atlas_durable_jobs (lease_token)
  where lease_token is not null;

-- ---------------------------------------------------------------------------
-- Durable leases: fencing + release audit
-- ---------------------------------------------------------------------------
alter table public.atlas_durable_leases
  add column if not exists lease_token text;
alter table public.atlas_durable_leases
  add column if not exists lease_version integer not null default 0;
alter table public.atlas_durable_leases
  add column if not exists heartbeat_at timestamptz;
alter table public.atlas_durable_leases
  add column if not exists worker_started_at timestamptz;
alter table public.atlas_durable_leases
  add column if not exists worker_instance_id text;
alter table public.atlas_durable_leases
  add column if not exists released_at timestamptz;
alter table public.atlas_durable_leases
  add column if not exists release_reason text;

create index if not exists atlas_durable_leases_token_idx
  on public.atlas_durable_leases (lease_token)
  where lease_token is not null;

-- ---------------------------------------------------------------------------
-- Heartbeats: progress + fencing fields
-- ---------------------------------------------------------------------------
alter table public.atlas_durable_heartbeats
  add column if not exists lease_token text;
alter table public.atlas_durable_heartbeats
  add column if not exists current_step_id text;
alter table public.atlas_durable_heartbeats
  add column if not exists current_stage text;
alter table public.atlas_durable_heartbeats
  add column if not exists progress_marker text;
alter table public.atlas_durable_heartbeats
  add column if not exists last_external_action_id text;
alter table public.atlas_durable_heartbeats
  add column if not exists last_artifact_id text;
alter table public.atlas_durable_heartbeats
  add column if not exists worker_instance_id text;

-- ---------------------------------------------------------------------------
-- Job recovery ledger (Phase 1-4)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_job_recoveries (
  recovery_id uuid primary key,
  job_id uuid not null references public.atlas_durable_jobs(job_id) on delete cascade,
  run_id uuid not null references public.atlas_durable_runs(run_id) on delete cascade,
  detected_at timestamptz not null default now(),
  detected_reason text not null,
  previous_lease_owner text,
  previous_lease_token text,
  recovery_worker_id text,
  recovery_attempt integer not null default 1,
  recovery_from_step_id text,
  recovery_strategy text,
  recovery_status text not null default 'detected'
    check (recovery_status in (
      'detected', 'assessing', 'recovering', 'recovered', 'manual_review', 'failed'
    )),
  recovered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  diagnostic_id text,
  assessment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.atlas_durable_job_recoveries is
  'Phase 1-4 durable recovery ledger. Not retry-as-recovery. Retention: with job/run.';

create index if not exists atlas_durable_job_recoveries_job_id_idx
  on public.atlas_durable_job_recoveries (job_id, detected_at desc);
create index if not exists atlas_durable_job_recoveries_run_id_idx
  on public.atlas_durable_job_recoveries (run_id);
create index if not exists atlas_durable_job_recoveries_status_idx
  on public.atlas_durable_job_recoveries (recovery_status, updated_at);
create index if not exists atlas_durable_job_recoveries_detected_at_idx
  on public.atlas_durable_job_recoveries (detected_at);

-- Metrics counters (process-agnostic durable counters)
create table if not exists public.atlas_durable_lease_metrics (
  metric_key text primary key,
  metric_value double precision not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.atlas_durable_job_recoveries enable row level security;
alter table public.atlas_durable_lease_metrics enable row level security;

drop policy if exists "atlas_durable_job_recoveries_deny" on public.atlas_durable_job_recoveries;
create policy "atlas_durable_job_recoveries_deny"
  on public.atlas_durable_job_recoveries for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_lease_metrics_deny" on public.atlas_durable_lease_metrics;
create policy "atlas_durable_lease_metrics_deny"
  on public.atlas_durable_lease_metrics for all to anon, authenticated
  using (false) with check (false);

commit;
