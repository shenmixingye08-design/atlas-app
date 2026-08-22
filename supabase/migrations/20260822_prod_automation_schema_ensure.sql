-- Production schema ensure for objects that have been missing from PostgREST
-- schema cache (PGRST205): atlas_deliverable_files, atlas_automation_jobs,
-- atlas_x_autopost_settings, atlas_claim_x_post_jobs, atlas_user_state,
-- atlas_user_notifications.
--
-- Additive / idempotent only. Safe to re-run.
-- Does NOT drop tables, wipe rows, or reset credentials/jobs/posts.

-- ---------------------------------------------------------------------------
-- atlas_deliverable_files (20260726 + 20260727 + 20260804 + 20260805)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_deliverable_files (
  id uuid primary key,
  user_id text not null,
  file_name text not null,
  format text not null,
  mime_type text not null,
  is_placeholder boolean not null default false,
  source_content text not null,
  base_file_name text not null,
  size_bytes integer,
  content_base64 text,
  generated_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.atlas_deliverable_files add column if not exists user_id text;
alter table public.atlas_deliverable_files add column if not exists file_name text;
alter table public.atlas_deliverable_files add column if not exists format text;
alter table public.atlas_deliverable_files add column if not exists mime_type text;
alter table public.atlas_deliverable_files add column if not exists is_placeholder boolean not null default false;
alter table public.atlas_deliverable_files add column if not exists source_content text;
alter table public.atlas_deliverable_files add column if not exists base_file_name text;
alter table public.atlas_deliverable_files add column if not exists size_bytes integer;
alter table public.atlas_deliverable_files add column if not exists content_base64 text;
alter table public.atlas_deliverable_files add column if not exists generated_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists expires_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists created_at timestamptz not null default now();
alter table public.atlas_deliverable_files add column if not exists content_sha256 text;
alter table public.atlas_deliverable_files add column if not exists storage_bucket text;
alter table public.atlas_deliverable_files add column if not exists storage_path text;
alter table public.atlas_deliverable_files add column if not exists storage_status text not null default 'pending';
alter table public.atlas_deliverable_files add column if not exists storage_error text;
alter table public.atlas_deliverable_files add column if not exists has_pk_header boolean;
alter table public.atlas_deliverable_files add column if not exists ooxml_verified boolean;
alter table public.atlas_deliverable_files add column if not exists download_count integer not null default 0;
alter table public.atlas_deliverable_files add column if not exists last_downloaded_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists deletion_reason text;
alter table public.atlas_deliverable_files add column if not exists deleted_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists deliverable_metadata jsonb;
alter table public.atlas_deliverable_files add column if not exists updated_at timestamptz not null default now();
alter table public.atlas_deliverable_files add column if not exists organization_id text;
alter table public.atlas_deliverable_files add column if not exists run_id text;
alter table public.atlas_deliverable_files add column if not exists job_id text;
alter table public.atlas_deliverable_files add column if not exists step_id text;
alter table public.atlas_deliverable_files add column if not exists verified_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists stored_at timestamptz;
alter table public.atlas_deliverable_files add column if not exists diagnostic_id text;
alter table public.atlas_deliverable_files add column if not exists context_version text;
alter table public.atlas_deliverable_files add column if not exists completion_evidence_id text;
alter table public.atlas_deliverable_files add column if not exists orphan_cleanup_status text;

create index if not exists atlas_deliverable_files_user_expires_idx
  on public.atlas_deliverable_files (user_id, expires_at desc);
create index if not exists atlas_deliverable_files_expires_idx
  on public.atlas_deliverable_files (expires_at);
create index if not exists atlas_deliverable_files_storage_path_idx
  on public.atlas_deliverable_files (storage_bucket, storage_path)
  where storage_path is not null;
create unique index if not exists atlas_deliverable_files_storage_path_uidx
  on public.atlas_deliverable_files (storage_bucket, storage_path)
  where storage_path is not null and deleted_at is null;
create index if not exists atlas_deliverable_files_sha256_idx
  on public.atlas_deliverable_files (content_sha256)
  where content_sha256 is not null;
create index if not exists atlas_deliverable_files_owner_status_idx
  on public.atlas_deliverable_files (user_id, storage_status);
create index if not exists atlas_deliverable_files_job_idx
  on public.atlas_deliverable_files (job_id)
  where job_id is not null;
create index if not exists atlas_deliverable_files_org_idx
  on public.atlas_deliverable_files (organization_id)
  where organization_id is not null;
create index if not exists atlas_deliverable_files_evidence_idx
  on public.atlas_deliverable_files (completion_evidence_id);
create index if not exists atlas_deliverable_files_verified_idx
  on public.atlas_deliverable_files (user_id, verified_at desc);

alter table public.atlas_deliverable_files enable row level security;
drop policy if exists "atlas_deliverable_files_deny_anon" on public.atlas_deliverable_files;
create policy "atlas_deliverable_files_deny_anon"
  on public.atlas_deliverable_files
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_deliverable_files from anon, authenticated;
grant all on public.atlas_deliverable_files to service_role;

-- ---------------------------------------------------------------------------
-- atlas_automation_jobs (20260722)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_automation_jobs (
  id uuid primary key,
  user_id text not null,
  automation_id text,
  job_type text not null default 'automation',
  status text not null default 'queued',
  scheduled_at timestamptz,
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  current_step text,
  progress_percent integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  result_summary text,
  artifact_id text,
  external_result_id text,
  external_result_url text,
  idempotency_key text not null,
  push_status text not null default 'pending',
  auto_recovered boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

alter table public.atlas_automation_jobs add column if not exists user_id text;
alter table public.atlas_automation_jobs add column if not exists automation_id text;
alter table public.atlas_automation_jobs add column if not exists job_type text not null default 'automation';
alter table public.atlas_automation_jobs add column if not exists status text not null default 'queued';
alter table public.atlas_automation_jobs add column if not exists scheduled_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists queued_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists started_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists completed_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists failed_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists current_step text;
alter table public.atlas_automation_jobs add column if not exists progress_percent integer not null default 0;
alter table public.atlas_automation_jobs add column if not exists attempt_count integer not null default 0;
alter table public.atlas_automation_jobs add column if not exists max_attempts integer not null default 3;
alter table public.atlas_automation_jobs add column if not exists next_retry_at timestamptz;
alter table public.atlas_automation_jobs add column if not exists last_error_code text;
alter table public.atlas_automation_jobs add column if not exists last_error_message text;
alter table public.atlas_automation_jobs add column if not exists result_summary text;
alter table public.atlas_automation_jobs add column if not exists artifact_id text;
alter table public.atlas_automation_jobs add column if not exists external_result_id text;
alter table public.atlas_automation_jobs add column if not exists external_result_url text;
alter table public.atlas_automation_jobs add column if not exists idempotency_key text;
alter table public.atlas_automation_jobs add column if not exists push_status text not null default 'pending';
alter table public.atlas_automation_jobs add column if not exists auto_recovered boolean not null default false;
alter table public.atlas_automation_jobs add column if not exists steps jsonb not null default '[]'::jsonb;
alter table public.atlas_automation_jobs add column if not exists created_at timestamptz not null default now();
alter table public.atlas_automation_jobs add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_automation_jobs_idempotency_key_key'
  ) then
    begin
      alter table public.atlas_automation_jobs
        add constraint atlas_automation_jobs_idempotency_key_key unique (idempotency_key);
    exception
      when duplicate_object then null;
      when unique_violation then null;
    end;
  end if;
end $$;

create index if not exists atlas_automation_jobs_user_status_idx
  on public.atlas_automation_jobs (user_id, status);
create index if not exists atlas_automation_jobs_automation_idx
  on public.atlas_automation_jobs (automation_id, scheduled_at);
create index if not exists atlas_automation_jobs_next_retry_idx
  on public.atlas_automation_jobs (next_retry_at)
  where status = 'retrying';
create index if not exists atlas_automation_jobs_running_stale_idx
  on public.atlas_automation_jobs (updated_at)
  where status = 'running';

alter table public.atlas_automation_jobs enable row level security;
drop policy if exists "atlas_automation_jobs_deny_anon" on public.atlas_automation_jobs;
create policy "atlas_automation_jobs_deny_anon"
  on public.atlas_automation_jobs
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_automation_jobs from anon, authenticated;
grant all on public.atlas_automation_jobs to service_role;

-- ---------------------------------------------------------------------------
-- atlas_x_autopost_settings + runs (20260720)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_x_autopost_settings (
  user_id text primary key,
  enabled boolean not null default false,
  mode text not null default 'approval',
  purpose text not null default '',
  themes jsonb not null default '[]'::jsonb,
  audience text not null default '',
  tone text not null default '',
  frequency text not null default 'daily_1',
  days_of_week jsonb not null default '[]'::jsonb,
  post_times jsonb not null default '["09:00"]'::jsonb,
  timezone text not null default 'Asia/Tokyo',
  include_hashtags boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_x_autopost_settings add column if not exists enabled boolean not null default false;
alter table public.atlas_x_autopost_settings add column if not exists mode text not null default 'approval';
alter table public.atlas_x_autopost_settings add column if not exists purpose text not null default '';
alter table public.atlas_x_autopost_settings add column if not exists themes jsonb not null default '[]'::jsonb;
alter table public.atlas_x_autopost_settings add column if not exists audience text not null default '';
alter table public.atlas_x_autopost_settings add column if not exists tone text not null default '';
alter table public.atlas_x_autopost_settings add column if not exists frequency text not null default 'daily_1';
alter table public.atlas_x_autopost_settings add column if not exists days_of_week jsonb not null default '[]'::jsonb;
alter table public.atlas_x_autopost_settings add column if not exists post_times jsonb not null default '["09:00"]'::jsonb;
alter table public.atlas_x_autopost_settings add column if not exists timezone text not null default 'Asia/Tokyo';
alter table public.atlas_x_autopost_settings add column if not exists include_hashtags boolean not null default false;
alter table public.atlas_x_autopost_settings add column if not exists created_at timestamptz not null default now();
alter table public.atlas_x_autopost_settings add column if not exists updated_at timestamptz not null default now();

create index if not exists atlas_x_autopost_settings_enabled_idx
  on public.atlas_x_autopost_settings (enabled);

alter table public.atlas_x_autopost_settings enable row level security;
drop policy if exists "atlas_x_autopost_settings_deny_anon" on public.atlas_x_autopost_settings;
create policy "atlas_x_autopost_settings_deny_anon"
  on public.atlas_x_autopost_settings
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_x_autopost_settings from anon, authenticated;
grant all on public.atlas_x_autopost_settings to service_role;

create table if not exists public.atlas_x_autopost_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slot_key text not null,
  scheduled_for timestamptz,
  status text not null default 'processing',
  mode text not null default 'approval',
  post_type text,
  text text,
  tweet_id text,
  tweet_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot_key)
);

alter table public.atlas_x_autopost_runs enable row level security;
drop policy if exists "atlas_x_autopost_runs_deny_anon" on public.atlas_x_autopost_runs;
create policy "atlas_x_autopost_runs_deny_anon"
  on public.atlas_x_autopost_runs
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_x_autopost_runs from anon, authenticated;
grant all on public.atlas_x_autopost_runs to service_role;

-- ---------------------------------------------------------------------------
-- atlas_x_post_jobs + atlas_claim_x_post_jobs (20260804)
-- ---------------------------------------------------------------------------
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
  deleted_at timestamptz
);

alter table public.atlas_x_post_drafts enable row level security;
drop policy if exists "atlas_x_post_drafts_deny_anon" on public.atlas_x_post_drafts;
create policy "atlas_x_post_drafts_deny_anon"
  on public.atlas_x_post_drafts
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_x_post_drafts from anon, authenticated;
grant all on public.atlas_x_post_drafts to service_role;

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
  updated_at timestamptz not null default now()
);

alter table public.atlas_x_post_jobs add column if not exists owner_id text;
alter table public.atlas_x_post_jobs add column if not exists status text not null default 'scheduled';
alter table public.atlas_x_post_jobs add column if not exists approval_status text not null default 'approved';
alter table public.atlas_x_post_jobs add column if not exists scheduled_at timestamptz;
alter table public.atlas_x_post_jobs add column if not exists next_attempt_at timestamptz;
alter table public.atlas_x_post_jobs add column if not exists claimed_by text;
alter table public.atlas_x_post_jobs add column if not exists claimed_at timestamptz;
alter table public.atlas_x_post_jobs add column if not exists lease_expires_at timestamptz;
alter table public.atlas_x_post_jobs add column if not exists attempt integer not null default 0;
alter table public.atlas_x_post_jobs add column if not exists max_attempts integer not null default 5;
alter table public.atlas_x_post_jobs add column if not exists idempotency_key text;
alter table public.atlas_x_post_jobs add column if not exists provider_post_id text;
alter table public.atlas_x_post_jobs add column if not exists canceled_at timestamptz;
alter table public.atlas_x_post_jobs add column if not exists created_at timestamptz not null default now();
alter table public.atlas_x_post_jobs add column if not exists updated_at timestamptz not null default now();

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
drop policy if exists "atlas_x_post_jobs_deny_anon" on public.atlas_x_post_jobs;
create policy "atlas_x_post_jobs_deny_anon"
  on public.atlas_x_post_jobs
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_x_post_jobs from anon, authenticated;
grant all on public.atlas_x_post_jobs to service_role;

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

-- ---------------------------------------------------------------------------
-- atlas_user_state (20260711) — blob SoT including atlasNotifications
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_user_state (
  user_id text not null,
  domain text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, domain)
);

alter table public.atlas_user_state enable row level security;
drop policy if exists "atlas_user_state_all" on public.atlas_user_state;
drop policy if exists "atlas_user_state_deny_anon" on public.atlas_user_state;
create policy "atlas_user_state_deny_anon"
  on public.atlas_user_state
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_user_state from anon, authenticated;
grant all on public.atlas_user_state to service_role;

-- ---------------------------------------------------------------------------
-- atlas_user_notifications + atlas_notification_dlq
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_user_notifications (
  notification_id text primary key,
  owner_id text not null,
  organization_id text,
  audience text not null default 'user',
  source_type text,
  source_id text,
  event_type text not null,
  channel text not null default 'in_app',
  title text not null,
  body text not null,
  severity text,
  status text not null default 'pending',
  read_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  max_retries integer not null default 5,
  idempotency_key text not null,
  diagnostic_id text,
  metadata jsonb not null default '{}'::jsonb,
  related_task_id text,
  related_service text,
  action_url text,
  target_type text,
  target_id text,
  workflow_run_id text,
  deliverable_id text,
  request_id text,
  automation_id text,
  line_event text,
  event_category text,
  push_sent_at timestamptz,
  push_failed_at timestamptz,
  push_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists atlas_user_notifications_idempotency_uidx
  on public.atlas_user_notifications (owner_id, idempotency_key)
  where deleted_at is null;

create index if not exists atlas_user_notifications_owner_created_idx
  on public.atlas_user_notifications (owner_id, created_at desc)
  where deleted_at is null;

alter table public.atlas_user_notifications enable row level security;
drop policy if exists "atlas_user_notifications_deny_anon"
  on public.atlas_user_notifications;
create policy "atlas_user_notifications_deny_anon"
  on public.atlas_user_notifications
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_user_notifications from anon, authenticated;
grant all on public.atlas_user_notifications to service_role;

create table if not exists public.atlas_notification_dlq (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null,
  user_id text not null,
  channel text not null,
  title text not null,
  message text not null,
  attempt_count integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'dead'
    check (status in ('pending_retry', 'dead', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_notification_dlq enable row level security;
drop policy if exists "atlas_notification_dlq_deny_anon"
  on public.atlas_notification_dlq;
create policy "atlas_notification_dlq_deny_anon"
  on public.atlas_notification_dlq
  for all to anon, authenticated
  using (false) with check (false);
revoke all on public.atlas_notification_dlq from anon, authenticated;
grant all on public.atlas_notification_dlq to service_role;

-- Refresh PostgREST schema cache so tables/RPC are visible immediately.
notify pgrst, 'reload schema';
