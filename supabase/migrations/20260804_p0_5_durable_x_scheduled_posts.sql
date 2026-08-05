-- P0-5: Durable X drafts + scheduled post jobs (row SoT).
-- Idempotent. Apply after atlas_x_oauth_credentials / atlas_x_autopost.
-- Rollback: DROP TABLE atlas_x_post_jobs, atlas_x_post_drafts (export first).
-- Production without this migration: X schedule/draft APIs fail-closed (no Map SoT).

-- 1) Drafts (per-user, optimistic concurrency via version)
create table if not exists public.atlas_x_post_drafts (
  draft_id text primary key,
  owner_id text not null,
  organization_id text,
  content text not null,
  content_hash text not null,
  media_ids jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint atlas_x_post_drafts_version_check check (version >= 1)
);

create index if not exists atlas_x_post_drafts_owner_updated_idx
  on public.atlas_x_post_drafts (owner_id, updated_at desc)
  where deleted_at is null;

alter table public.atlas_x_post_drafts enable row level security;

drop policy if exists "atlas_x_post_drafts_deny_anon"
  on public.atlas_x_post_drafts;
create policy "atlas_x_post_drafts_deny_anon"
  on public.atlas_x_post_drafts
  for all to anon, authenticated
  using (false) with check (false);

-- 2) Scheduled / immediate job ledger with claim + provider evidence
create table if not exists public.atlas_x_post_jobs (
  x_post_job_id text primary key,
  owner_id text not null,
  organization_id text,
  automation_id text,
  run_id text,
  draft_id text,
  connection_id text,
  content text not null,
  content_hash text not null,
  media_ids jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled',
  approval_status text not null default 'approved',
  scheduled_at timestamptz,
  next_attempt_at timestamptz,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  idempotency_key text not null,
  provider_request_id text,
  provider_post_id text,
  provider_response_hash text,
  posted_at timestamptz,
  canceled_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  diagnostic_id text,
  completion_evidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_x_post_jobs_status_check check (status in (
    'draft',
    'pending_approval',
    'approved',
    'scheduled',
    'claimed',
    'posting',
    'posted',
    'retry_scheduled',
    'failed',
    'canceled',
    'unknown_outcome'
  )),
  constraint atlas_x_post_jobs_approval_check check (approval_status in (
    'not_required',
    'pending',
    'approved',
    'rejected'
  )),
  constraint atlas_x_post_jobs_attempt_check
    check (attempt >= 0 and max_attempts >= 0 and attempt <= max_attempts + 1),
  constraint atlas_x_post_jobs_posted_requires_provider
    check (
      status <> 'posted'
      or (provider_post_id is not null and posted_at is not null)
    )
);

create unique index if not exists atlas_x_post_jobs_idempotency_uidx
  on public.atlas_x_post_jobs (owner_id, idempotency_key);

create unique index if not exists atlas_x_post_jobs_provider_post_uidx
  on public.atlas_x_post_jobs (provider_post_id)
  where provider_post_id is not null;

create index if not exists atlas_x_post_jobs_due_idx
  on public.atlas_x_post_jobs (next_attempt_at, scheduled_at)
  where status in ('scheduled', 'retry_scheduled', 'approved')
    and approval_status in ('approved', 'not_required');

create index if not exists atlas_x_post_jobs_owner_created_idx
  on public.atlas_x_post_jobs (owner_id, created_at desc);

create index if not exists atlas_x_post_jobs_lease_idx
  on public.atlas_x_post_jobs (lease_expires_at)
  where status in ('claimed', 'posting');

alter table public.atlas_x_post_jobs enable row level security;

drop policy if exists "atlas_x_post_jobs_deny_anon"
  on public.atlas_x_post_jobs;
create policy "atlas_x_post_jobs_deny_anon"
  on public.atlas_x_post_jobs
  for all to anon, authenticated
  using (false) with check (false);

-- Atomic claim: due + approved + schedulable + lease expired/null
create or replace function public.atlas_claim_x_post_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_ms integer,
  p_now timestamptz default now()
)
returns setof public.atlas_x_post_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 50));
  v_lease interval := make_interval(secs => greatest(5, least(coalesce(p_lease_ms, 60000), 600000)) / 1000.0);
begin
  return query
  with candidates as (
    select j.x_post_job_id
    from public.atlas_x_post_jobs j
    where j.status in ('scheduled', 'retry_scheduled', 'approved')
      and j.approval_status in ('approved', 'not_required')
      and coalesce(j.next_attempt_at, j.scheduled_at, j.created_at) <= p_now
      and (j.lease_expires_at is null or j.lease_expires_at < p_now)
      and j.canceled_at is null
      and j.provider_post_id is null
    order by coalesce(j.next_attempt_at, j.scheduled_at, j.created_at) asc
    for update skip locked
    limit v_limit
  )
  update public.atlas_x_post_jobs j
  set
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = p_now,
    lease_expires_at = p_now + v_lease,
    attempt = j.attempt + 1,
    updated_at = p_now
  from candidates c
  where j.x_post_job_id = c.x_post_job_id
  returning j.*;
end;
$$;

revoke all on function public.atlas_claim_x_post_jobs(text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.atlas_claim_x_post_jobs(text, integer, integer, timestamptz)
  to service_role;

comment on table public.atlas_x_post_jobs is
  'P0-5 Durable X scheduled/post jobs. Service role only. No process-memory SoT.';
comment on table public.atlas_x_post_drafts is
  'P0-5 Durable X drafts. Service role only.';
