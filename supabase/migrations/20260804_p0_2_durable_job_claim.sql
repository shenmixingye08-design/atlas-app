-- P0-2: Harden atlas_work_queue_jobs for Production durable atomic claim.
-- Idempotent. Rollback: drop function / constraints added below (table data kept).
-- Partial apply safe: IF NOT EXISTS / OR REPLACE throughout.

-- Required columns (nullable for backfill / older rows)
alter table public.atlas_work_queue_jobs
  add column if not exists organization_id text;

alter table public.atlas_work_queue_jobs
  add column if not exists claimed_at timestamptz;

alter table public.atlas_work_queue_jobs
  add column if not exists failed_at timestamptz;

-- Status validation
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

-- Attempt integrity
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

-- Atomic claim RPC (transactional SKIP LOCKED). Used by PostgresWorkQueueStore.
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

-- Atomic stuck reclaim → retry_scheduled (only expired lease / stale heartbeat)
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
