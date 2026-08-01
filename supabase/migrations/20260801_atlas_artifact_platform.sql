-- Unified Artifact Platform (additive, non-destructive)
-- Extends existing atlas_deliverable_files / versions without rewriting binaries.

alter table public.atlas_deliverable_files
  add column if not exists root_artifact_id uuid,
  add column if not exists source_artifact_id uuid,
  add column if not exists revision_number integer,
  add column if not exists conversion_type text,
  add column if not exists preview_status text,
  add column if not exists validation_status text,
  add column if not exists artifact_status text,
  add column if not exists idempotency_key text;

create index if not exists atlas_deliverable_files_root_idx
  on public.atlas_deliverable_files (root_artifact_id)
  where root_artifact_id is not null;

create index if not exists atlas_deliverable_files_source_idx
  on public.atlas_deliverable_files (source_artifact_id)
  where source_artifact_id is not null;

create index if not exists atlas_deliverable_files_user_status_idx
  on public.atlas_deliverable_files (user_id, artifact_status, generated_at desc);

create unique index if not exists atlas_deliverable_files_idempotency_uidx
  on public.atlas_deliverable_files (user_id, idempotency_key)
  where idempotency_key is not null;

-- Conversion / lineage edges (derivative graph)
create table if not exists public.atlas_artifact_conversions (
  id text primary key,
  user_id text not null,
  source_artifact_id uuid not null,
  target_artifact_id uuid not null,
  source_format text not null,
  target_format text not null,
  quality text not null default 'needs_review',
  engine text,
  job_id text,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_artifact_conversions_user_idx
  on public.atlas_artifact_conversions (user_id, created_at desc);

create index if not exists atlas_artifact_conversions_source_idx
  on public.atlas_artifact_conversions (source_artifact_id);

alter table public.atlas_artifact_conversions enable row level security;
drop policy if exists "atlas_artifact_conversions_deny_anon"
  on public.atlas_artifact_conversions;
create policy "atlas_artifact_conversions_deny_anon"
  on public.atlas_artifact_conversions
  for all to anon, authenticated
  using (false) with check (false);

-- Artifact job stages (generation / conversion / revision)
create table if not exists public.atlas_artifact_jobs (
  id text primary key,
  user_id text not null,
  phase text not null default 'queued',
  status text not null default 'running',
  source_artifact_id uuid,
  artifact_id uuid,
  target_format text,
  progress integer not null default 0,
  retry_count integer not null default 0,
  failed_stage text,
  diagnostic_id text,
  idempotency_key text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_artifact_jobs_user_idx
  on public.atlas_artifact_jobs (user_id, updated_at desc);

create unique index if not exists atlas_artifact_jobs_idempotency_uidx
  on public.atlas_artifact_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.atlas_artifact_jobs enable row level security;
drop policy if exists "atlas_artifact_jobs_deny_anon"
  on public.atlas_artifact_jobs;
create policy "atlas_artifact_jobs_deny_anon"
  on public.atlas_artifact_jobs
  for all to anon, authenticated
  using (false) with check (false);

-- Admin / security audit for delete/restore/download anomalies
create table if not exists public.atlas_artifact_audit_log (
  id bigserial primary key,
  user_id text not null,
  artifact_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_artifact_audit_log_user_idx
  on public.atlas_artifact_audit_log (user_id, created_at desc);

alter table public.atlas_artifact_audit_log enable row level security;
drop policy if exists "atlas_artifact_audit_log_deny_anon"
  on public.atlas_artifact_audit_log;
create policy "atlas_artifact_audit_log_deny_anon"
  on public.atlas_artifact_audit_log
  for all to anon, authenticated
  using (false) with check (false);
