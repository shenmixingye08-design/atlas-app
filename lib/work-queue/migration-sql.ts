/**
 * Inline SQL for work-queue probe apply path.
 * Mirrors:
 * - supabase/migrations/20260802_atlas_work_queue.sql
 * - supabase/migrations/20260804_p0_2_durable_job_claim.sql
 * Idempotent. SAFE: additive DDL + deny-all RLS for anon/authenticated.
 */

export const ATLAS_WORK_QUEUE_BASE_MIGRATION_SQL = `
-- Durable work queue for Scheduler / Worker (MINERVOT).
-- Source of truth: Postgres. Not process memory.

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
`;

export const ATLAS_WORK_QUEUE_DURABLE_CLAIM_MIGRATION_SQL = `
-- P0-2: Harden atlas_work_queue_jobs for Production durable atomic claim.

alter table public.atlas_work_queue_jobs
  add column if not exists organization_id text;

alter table public.atlas_work_queue_jobs
  add column if not exists claimed_at timestamptz;

alter table public.atlas_work_queue_jobs
  add column if not exists failed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_work_queue_jobs_status_check'
  ) then
    alter table public.atlas_work_queue_jobs
      add constraint atlas_work_queue_jobs_status_check
      check (status in (
        'queued',
        'leased',
        'running',
        'waiting_approval',
        'waiting_input',
        'retry_scheduled',
        'completed',
        'partially_completed',
        'failed',
        'cancelled',
        'dead_letter'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_work_queue_jobs_attempt_check'
  ) then
    alter table public.atlas_work_queue_jobs
      add constraint atlas_work_queue_jobs_attempt_check
      check (attempt >= 0 and max_attempts >= 1 and attempt <= max_attempts + 1);
  end if;
end $$;

create index if not exists atlas_work_queue_jobs_claim_due_idx
  on public.atlas_work_queue_jobs (priority desc, available_at asc)
  where status in ('queued', 'retry_scheduled');

create index if not exists atlas_work_queue_jobs_lease_expiry_idx
  on public.atlas_work_queue_jobs (lease_expires_at)
  where status in ('leased', 'running');

create index if not exists atlas_work_queue_jobs_org_idx
  on public.atlas_work_queue_jobs (organization_id, status)
  where organization_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_work_queue_jobs_idempotency_key_key'
  ) then
    begin
      alter table public.atlas_work_queue_jobs
        add constraint atlas_work_queue_jobs_idempotency_key_key unique (idempotency_key);
    exception
      when duplicate_object then null;
      when unique_violation then
        raise notice 'P0-2: idempotency_key duplicates exist — unique not added';
    end;
  end if;
end $$;

create or replace function public.atlas_claim_work_queue_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_ms integer,
  p_now timestamptz default now()
)
returns setof public.atlas_work_queue_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_expires timestamptz := p_now + make_interval(secs => greatest(p_lease_ms, 1000) / 1000.0);
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'atlas_claim_work_queue_jobs: worker_id required';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'atlas_claim_work_queue_jobs: limit must be >= 1';
  end if;

  return query
  with cte as (
    select j.job_id
    from public.atlas_work_queue_jobs j
    where (
      j.status in ('queued', 'retry_scheduled')
      and j.available_at <= p_now
    ) or (
      j.status in ('leased', 'running')
      and j.lease_expires_at is not null
      and j.lease_expires_at < p_now
    )
    order by j.priority desc, j.available_at asc
    for update skip locked
    limit least(p_limit, 100)
  )
  update public.atlas_work_queue_jobs j
  set status = 'leased',
      lease_owner = p_worker_id,
      lease_expires_at = v_lease_expires,
      heartbeat_at = p_now,
      claimed_at = coalesce(j.claimed_at, p_now),
      started_at = coalesce(j.started_at, p_now),
      attempt = case
        when j.status in ('leased', 'running') then j.attempt + 1
        when j.status = 'retry_scheduled' then j.attempt
        else greatest(j.attempt, 1)
      end,
      updated_at = p_now
  from cte
  where j.job_id = cte.job_id
  returning j.*;
end;
$$;

revoke all on function public.atlas_claim_work_queue_jobs(text, integer, integer, timestamptz) from public;
grant execute on function public.atlas_claim_work_queue_jobs(text, integer, integer, timestamptz) to service_role;

create or replace function public.atlas_reclaim_stuck_work_queue_job(
  p_job_id uuid,
  p_now timestamptz,
  p_stuck_before timestamptz,
  p_attempt integer,
  p_retry_at timestamptz,
  p_status text,
  p_diagnostic_id text,
  p_last_error text
)
returns public.atlas_work_queue_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.atlas_work_queue_jobs;
begin
  if p_status not in ('retry_scheduled', 'failed', 'dead_letter') then
    raise exception 'atlas_reclaim_stuck_work_queue_job: invalid terminal status';
  end if;

  update public.atlas_work_queue_jobs j
  set status = p_status,
      attempt = p_attempt,
      retry_at = case when p_status = 'retry_scheduled' then p_retry_at else null end,
      available_at = case when p_status = 'retry_scheduled' then p_retry_at else j.available_at end,
      error_code = 'stuck_recovered',
      diagnostic_id = p_diagnostic_id,
      lease_owner = null,
      lease_expires_at = null,
      last_error = p_last_error,
      completed_at = case
        when p_status in ('failed', 'dead_letter') then p_now
        else j.completed_at
      end,
      failed_at = case
        when p_status in ('failed', 'dead_letter') then p_now
        else j.failed_at
      end,
      updated_at = p_now
  where j.job_id = p_job_id
    and j.status in ('leased', 'running')
    and j.heartbeat_at is not null
    and j.heartbeat_at < p_stuck_before
    and (
      j.lease_expires_at is null
      or j.lease_expires_at < p_now
    )
  returning j.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.atlas_reclaim_stuck_work_queue_job(uuid, timestamptz, timestamptz, integer, timestamptz, text, text, text) from public;
grant execute on function public.atlas_reclaim_stuck_work_queue_job(uuid, timestamptz, timestamptz, integer, timestamptz, text, text, text) to service_role;
`;

/** Combined idempotent DDL for Production apply=1. */
export const ATLAS_WORK_QUEUE_MIGRATION_SQL = `${ATLAS_WORK_QUEUE_BASE_MIGRATION_SQL}

${ATLAS_WORK_QUEUE_DURABLE_CLAIM_MIGRATION_SQL}`;
