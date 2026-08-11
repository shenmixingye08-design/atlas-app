/**
 * Inline SQL for Production apply=1 (serverless may omit supabase/migrations).
 * Covers Word CORE LOOP durable SoT tables:
 * - atlas_document_generation_jobs (P0-7)
 * - atlas_deliverable_jobs (P0-2 / 20260727)
 * Idempotent. Omits ALTER on atlas_deliverable_files so apply does not fail when
 * that table/columns differ.
 */

export const ATLAS_DOCUMENT_PIPELINE_MIGRATION_SQL = `
-- P0-7: Document generation pipeline jobs (progress / retry / cancel).
-- SAFE: additive. Does not alter Planner/Deliverable cores.

create table if not exists public.atlas_document_generation_jobs (
  id text primary key,
  owner_user_id text not null,
  organization_id text,
  work_job_id text,
  run_id text,
  status text not null
    check (status in (
      'queued',
      'planning',
      'generating',
      'rendering',
      'exporting',
      'persisting',
      'verifying',
      'completed',
      'failed',
      'cancelled',
      'retry_scheduled',
      'timed_out'
    )),
  stage text not null default 'queued',
  requested_formats text[] not null default '{}',
  completed_formats text[] not null default '{}',
  failed_formats text[] not null default '{}',
  progress_pct integer not null default 0
    check (progress_pct >= 0 and progress_pct <= 100),
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  artifact_ids text[] not null default '{}',
  completion_evidence_ids text[] not null default '{}',
  checksums text[] not null default '{}',
  byte_sizes bigint[] not null default '{}',
  cancelled_at timestamptz,
  timed_out_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_document_generation_jobs_owner_idx
  on public.atlas_document_generation_jobs (owner_user_id, created_at desc);

create index if not exists atlas_document_generation_jobs_status_idx
  on public.atlas_document_generation_jobs (status, updated_at desc);

create index if not exists atlas_document_generation_jobs_retry_idx
  on public.atlas_document_generation_jobs (status, next_retry_at)
  where status = 'retry_scheduled';

create index if not exists atlas_document_generation_jobs_work_job_idx
  on public.atlas_document_generation_jobs (work_job_id)
  where work_job_id is not null;

create index if not exists atlas_document_generation_jobs_org_idx
  on public.atlas_document_generation_jobs (organization_id)
  where organization_id is not null;

alter table public.atlas_document_generation_jobs enable row level security;

drop policy if exists "atlas_document_generation_jobs_deny_anon"
  on public.atlas_document_generation_jobs;
create policy "atlas_document_generation_jobs_deny_anon"
  on public.atlas_document_generation_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_document_generation_jobs is
  'P0-7 unified document generation pipeline progress / retry / cancel.';

-- Job stage persistence for resumable Word pipeline (20260727).
create table if not exists public.atlas_deliverable_jobs (
  id text primary key,
  user_id text not null,
  format text not null default 'docx',
  stage text not null,
  status text not null default 'running',
  assignment text not null default '',
  source_content text not null default '',
  base_file_name text not null default 'document',
  deliverable_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  last_error_stage text,
  last_error_message text,
  notification_id text,
  notification_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_deliverable_jobs_user_updated_idx
  on public.atlas_deliverable_jobs (user_id, updated_at desc);

create index if not exists atlas_deliverable_jobs_status_lease_idx
  on public.atlas_deliverable_jobs (status, lease_expires_at);

alter table public.atlas_deliverable_jobs enable row level security;

drop policy if exists "atlas_deliverable_jobs_deny_anon"
  on public.atlas_deliverable_jobs;
create policy "atlas_deliverable_jobs_deny_anon"
  on public.atlas_deliverable_jobs
  for all to anon, authenticated
  using (false) with check (false);

-- Refresh PostgREST schema cache so new tables are visible immediately.
notify pgrst, 'reload schema';
`;
