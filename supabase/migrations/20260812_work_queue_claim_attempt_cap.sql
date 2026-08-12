-- Cap claim/reclaim attempt increments to satisfy atlas_work_queue_jobs_attempt_check.
-- Production evidence: Minute Scheduler drain_1 500 with pgCode=23514
-- (check_violation on atlas_work_queue_jobs_attempt_check), misclassified as
-- work_queue_schema_missing. Root cause: expired-lease reclaim did attempt+1
-- past max_attempts+1 and failed the whole claim UPDATE.
-- Idempotent: CREATE OR REPLACE only. Does not weaken CHECK constraints.

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

  -- Reclaim of expired leases must never write attempt > max_attempts+1
  -- (CHECK atlas_work_queue_jobs_attempt_check). Exhausted jobs → dead_letter.
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
  ),
  updated as (
    update public.atlas_work_queue_jobs j
    set status = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then 'dead_letter'
          else 'leased'
        end,
        lease_owner = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then null
          else p_worker_id
        end,
        lease_expires_at = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then null
          else v_lease_expires
        end,
        heartbeat_at = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then j.heartbeat_at
          else p_now
        end,
        claimed_at = coalesce(j.claimed_at, p_now),
        started_at = coalesce(j.started_at, p_now),
        attempt = least(
          case
            when j.status in ('leased', 'running') then j.attempt + 1
            when j.status = 'retry_scheduled' then j.attempt
            else greatest(j.attempt, 1)
          end,
          j.max_attempts + 1
        ),
        completed_at = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then p_now
          else j.completed_at
        end,
        failed_at = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then p_now
          else j.failed_at
        end,
        error_code = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then coalesce(j.error_code, 'max_attempts_exhausted_on_reclaim')
          else j.error_code
        end,
        last_error = case
          when j.status in ('leased', 'running')
            and j.attempt >= j.max_attempts
            then coalesce(j.last_error, 'max_attempts_exhausted_on_reclaim')
          else j.last_error
        end,
        updated_at = p_now
    from cte
    where j.job_id = cte.job_id
    returning j.*
  )
  select * from updated u where u.status = 'leased';
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
      attempt = least(greatest(coalesce(p_attempt, 0), 0), j.max_attempts + 1),
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
