-- Durable automation job queue (MINERVOT Phase 1).
-- Source of truth for job lifecycle — not browser memory or setTimeout-only state.
-- Server writes use service role (RLS deny-all for anon/auth).

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
  for all
  to anon, authenticated
  using (false)
  with check (false);
