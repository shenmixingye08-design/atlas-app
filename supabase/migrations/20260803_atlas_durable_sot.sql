-- Phase 1-2 Durable SoT foundation (MINERVOT).
-- Source of truth target: Postgres. Not process memory / file / globalThis.
-- This migration is foundation only — not wired to Queue/Worker/Automation yet.
--
-- Retention:
--   - Runs/steps/leases/heartbeats/retry/recovery: operational window (recommend 90d)
--   - Completion evidence: long-term audit (recommend 365d+)
--   - Idempotency keys: TTL via expires_at (recommend 7–30d)
--   - Scheduler occurrences: with automation lifetime + 90d after terminal
-- TTL enforcement is a later Phase job; columns are present for that work.
--
-- Rollback: see 20260803_atlas_durable_sot.down.sql

begin;

-- ---------------------------------------------------------------------------
-- SchedulerOccurrence
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_scheduler_occurrences (
  occurrence_id uuid primary key,
  owner_id text not null,
  automation_id text not null,
  occurrence_key text not null,
  schedule_id text,
  scheduled_at timestamptz not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'enqueued', 'completed', 'cancelled', 'failed')),
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Occurrence duplicate prevention (multi-instance scheduler)
  unique (automation_id, occurrence_key)
);

comment on table public.atlas_durable_scheduler_occurrences is
  'Durable scheduler occurrence reservation. Retention: automation lifetime + 90d after terminal. TTL column expires_at reserved.';

create index if not exists atlas_durable_occurrences_occurrence_id_idx
  on public.atlas_durable_scheduler_occurrences (occurrence_id);
create index if not exists atlas_durable_occurrences_status_idx
  on public.atlas_durable_scheduler_occurrences (status, scheduled_at);
create index if not exists atlas_durable_occurrences_created_at_idx
  on public.atlas_durable_scheduler_occurrences (created_at);
create index if not exists atlas_durable_occurrences_updated_at_idx
  on public.atlas_durable_scheduler_occurrences (updated_at);
create index if not exists atlas_durable_occurrences_owner_idx
  on public.atlas_durable_scheduler_occurrences (owner_id, status);

-- ---------------------------------------------------------------------------
-- JobRun
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_runs (
  run_id uuid primary key,
  owner_id text not null,
  automation_id text,
  job_id uuid,
  occurrence_id uuid references public.atlas_durable_scheduler_occurrences(occurrence_id)
    on delete set null,
  status text not null default 'pending'
    check (status in (
      'pending', 'queued', 'leased', 'running', 'retry_scheduled',
      'awaiting_approval', 'succeeded', 'failed', 'cancelled', 'dead_letter'
    )),
  trigger_type text not null default 'manual',
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

comment on table public.atlas_durable_runs is
  'Durable job run SoT. Retention: 90d operational (extend if audit requires). TTL via expires_at.';

create index if not exists atlas_durable_runs_run_id_idx
  on public.atlas_durable_runs (run_id);
create index if not exists atlas_durable_runs_job_id_idx
  on public.atlas_durable_runs (job_id);
create index if not exists atlas_durable_runs_occurrence_id_idx
  on public.atlas_durable_runs (occurrence_id);
create index if not exists atlas_durable_runs_status_idx
  on public.atlas_durable_runs (status, updated_at);
create index if not exists atlas_durable_runs_created_at_idx
  on public.atlas_durable_runs (created_at);
create index if not exists atlas_durable_runs_updated_at_idx
  on public.atlas_durable_runs (updated_at);
create index if not exists atlas_durable_runs_owner_status_idx
  on public.atlas_durable_runs (owner_id, status);

-- Optional reverse pointer from occurrence → run (set after run create)
alter table public.atlas_durable_scheduler_occurrences
  drop constraint if exists atlas_durable_occurrences_run_fk;
alter table public.atlas_durable_scheduler_occurrences
  add constraint atlas_durable_occurrences_run_fk
  foreign key (run_id) references public.atlas_durable_runs(run_id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- JobStep
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_steps (
  run_id uuid not null references public.atlas_durable_runs(run_id) on delete cascade,
  step_id text not null,
  job_id uuid,
  step_index integer not null,
  step_type text not null,
  status text not null default 'pending'
    check (status in (
      'pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'
    )),
  attempt integer not null default 0,
  input_bindings jsonb not null default '{}'::jsonb,
  output_bindings jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, step_id),
  unique (run_id, step_index)
);

comment on table public.atlas_durable_steps is
  'Durable steps for a run. Retention: with parent run.';

create index if not exists atlas_durable_steps_run_id_idx
  on public.atlas_durable_steps (run_id, step_index);
create index if not exists atlas_durable_steps_job_id_idx
  on public.atlas_durable_steps (job_id);
create index if not exists atlas_durable_steps_status_idx
  on public.atlas_durable_steps (status);
create index if not exists atlas_durable_steps_created_at_idx
  on public.atlas_durable_steps (created_at);
create index if not exists atlas_durable_steps_updated_at_idx
  on public.atlas_durable_steps (updated_at);

-- ---------------------------------------------------------------------------
-- Lease (one active lease row per run)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_leases (
  run_id uuid primary key references public.atlas_durable_runs(run_id) on delete cascade,
  job_id uuid,
  lease_owner text not null,
  lease_expires_at timestamptz not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.atlas_durable_leases is
  'Durable lease ownership. One lease per run_id (PK). Retention: with run / drop on release.';

create index if not exists atlas_durable_leases_lease_owner_idx
  on public.atlas_durable_leases (lease_owner, lease_expires_at);
create index if not exists atlas_durable_leases_job_id_idx
  on public.atlas_durable_leases (job_id);
create index if not exists atlas_durable_leases_expires_idx
  on public.atlas_durable_leases (lease_expires_at);
create index if not exists atlas_durable_leases_updated_at_idx
  on public.atlas_durable_leases (updated_at);

-- ---------------------------------------------------------------------------
-- Heartbeat
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_heartbeats (
  run_id uuid primary key references public.atlas_durable_runs(run_id) on delete cascade,
  job_id uuid,
  lease_owner text not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.atlas_durable_heartbeats is
  'Durable heartbeat SoT. Retention: with run. Index heartbeat_at for stuck detection.';

create index if not exists atlas_durable_heartbeats_heartbeat_at_idx
  on public.atlas_durable_heartbeats (heartbeat_at);
create index if not exists atlas_durable_heartbeats_lease_owner_idx
  on public.atlas_durable_heartbeats (lease_owner);
create index if not exists atlas_durable_heartbeats_job_id_idx
  on public.atlas_durable_heartbeats (job_id);
create index if not exists atlas_durable_heartbeats_updated_at_idx
  on public.atlas_durable_heartbeats (updated_at);

-- ---------------------------------------------------------------------------
-- RetryState
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_retry_states (
  run_id uuid primary key references public.atlas_durable_runs(run_id) on delete cascade,
  job_id uuid,
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  retry_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.atlas_durable_retry_states is
  'Durable retry schedule. Retention: with run. Index retry_at for drainers.';

create index if not exists atlas_durable_retry_retry_at_idx
  on public.atlas_durable_retry_states (retry_at)
  where retry_at is not null;
create index if not exists atlas_durable_retry_job_id_idx
  on public.atlas_durable_retry_states (job_id);
create index if not exists atlas_durable_retry_created_at_idx
  on public.atlas_durable_retry_states (created_at);
create index if not exists atlas_durable_retry_updated_at_idx
  on public.atlas_durable_retry_states (updated_at);

-- ---------------------------------------------------------------------------
-- RecoveryState
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_recovery_states (
  run_id uuid primary key references public.atlas_durable_runs(run_id) on delete cascade,
  job_id uuid,
  recovery_status text not null default 'needed'
    check (recovery_status in ('needed', 'in_progress', 'recovered', 'abandoned')),
  reason text,
  last_recovery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.atlas_durable_recovery_states is
  'Durable recovery tracking for stuck/leased runs. Retention: with run.';

create index if not exists atlas_durable_recovery_status_idx
  on public.atlas_durable_recovery_states (recovery_status, updated_at);
create index if not exists atlas_durable_recovery_job_id_idx
  on public.atlas_durable_recovery_states (job_id);
create index if not exists atlas_durable_recovery_created_at_idx
  on public.atlas_durable_recovery_states (created_at);
create index if not exists atlas_durable_recovery_updated_at_idx
  on public.atlas_durable_recovery_states (updated_at);

-- ---------------------------------------------------------------------------
-- CompletionEvidence (no duplicate evidence per run+kind+fingerprint)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_completion_evidence (
  evidence_id uuid primary key,
  run_id uuid not null references public.atlas_durable_runs(run_id) on delete cascade,
  job_id uuid,
  evidence_kind text not null,
  evidence_fingerprint text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Evidence duplicate prevention
  unique (run_id, evidence_kind, evidence_fingerprint)
);

comment on table public.atlas_durable_completion_evidence is
  'Durable completion evidence. Retention: 365d+ audit. Duplicates forbidden by unique constraint.';

create index if not exists atlas_durable_evidence_run_id_idx
  on public.atlas_durable_completion_evidence (run_id, created_at);
create index if not exists atlas_durable_evidence_job_id_idx
  on public.atlas_durable_completion_evidence (job_id);
create index if not exists atlas_durable_evidence_created_at_idx
  on public.atlas_durable_completion_evidence (created_at);
create index if not exists atlas_durable_evidence_updated_at_idx
  on public.atlas_durable_completion_evidence (updated_at);

-- ---------------------------------------------------------------------------
-- IdempotencyKey
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_durable_idempotency_keys (
  scope text not null,
  idempotency_key text not null,
  run_id uuid references public.atlas_durable_runs(run_id) on delete set null,
  job_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (scope, idempotency_key)
);

comment on table public.atlas_durable_idempotency_keys is
  'Durable idempotency registry. Retention/TTL via expires_at (recommend 7–30d).';

create index if not exists atlas_durable_idempotency_key_idx
  on public.atlas_durable_idempotency_keys (idempotency_key);
create index if not exists atlas_durable_idempotency_run_id_idx
  on public.atlas_durable_idempotency_keys (run_id);
create index if not exists atlas_durable_idempotency_job_id_idx
  on public.atlas_durable_idempotency_keys (job_id);
create index if not exists atlas_durable_idempotency_expires_at_idx
  on public.atlas_durable_idempotency_keys (expires_at)
  where expires_at is not null;
create index if not exists atlas_durable_idempotency_created_at_idx
  on public.atlas_durable_idempotency_keys (created_at);
create index if not exists atlas_durable_idempotency_updated_at_idx
  on public.atlas_durable_idempotency_keys (updated_at);

-- ---------------------------------------------------------------------------
-- RLS deny-all for anon/authenticated (service role only)
-- Roles may already exist on Supabase; create stubs for local Postgres tests.
-- ---------------------------------------------------------------------------
do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

alter table public.atlas_durable_scheduler_occurrences enable row level security;
alter table public.atlas_durable_runs enable row level security;
alter table public.atlas_durable_steps enable row level security;
alter table public.atlas_durable_leases enable row level security;
alter table public.atlas_durable_heartbeats enable row level security;
alter table public.atlas_durable_retry_states enable row level security;
alter table public.atlas_durable_recovery_states enable row level security;
alter table public.atlas_durable_completion_evidence enable row level security;
alter table public.atlas_durable_idempotency_keys enable row level security;

drop policy if exists "atlas_durable_occurrences_deny" on public.atlas_durable_scheduler_occurrences;
create policy "atlas_durable_occurrences_deny"
  on public.atlas_durable_scheduler_occurrences for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_runs_deny" on public.atlas_durable_runs;
create policy "atlas_durable_runs_deny"
  on public.atlas_durable_runs for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_steps_deny" on public.atlas_durable_steps;
create policy "atlas_durable_steps_deny"
  on public.atlas_durable_steps for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_leases_deny" on public.atlas_durable_leases;
create policy "atlas_durable_leases_deny"
  on public.atlas_durable_leases for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_heartbeats_deny" on public.atlas_durable_heartbeats;
create policy "atlas_durable_heartbeats_deny"
  on public.atlas_durable_heartbeats for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_retry_deny" on public.atlas_durable_retry_states;
create policy "atlas_durable_retry_deny"
  on public.atlas_durable_retry_states for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_recovery_deny" on public.atlas_durable_recovery_states;
create policy "atlas_durable_recovery_deny"
  on public.atlas_durable_recovery_states for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_evidence_deny" on public.atlas_durable_completion_evidence;
create policy "atlas_durable_evidence_deny"
  on public.atlas_durable_completion_evidence for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_durable_idempotency_deny" on public.atlas_durable_idempotency_keys;
create policy "atlas_durable_idempotency_deny"
  on public.atlas_durable_idempotency_keys for all to anon, authenticated
  using (false) with check (false);

commit;
