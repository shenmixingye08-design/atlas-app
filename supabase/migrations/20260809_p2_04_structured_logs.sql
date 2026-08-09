-- P2-04: Durable structured developer logs with correlation IDs (Postgres SoT).
-- Idempotent: safe to re-run.

create table if not exists public.atlas_structured_logs (
  id text primary key,
  correlation_id text not null,
  vercel_request_id text,
  diagnostic_id text,
  at timestamptz not null default now(),
  user_id text,
  job_id text,
  workflow_id text,
  commander_run_id text,
  step text,
  attempt integer,
  max_attempts integer,
  failure_class text,
  message text not null,
  cause text,
  reproduction text,
  fix_content text,
  stack_trace text,
  api_status text,
  api_response_summary text,
  duration_ms integer,
  process_log text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.atlas_structured_logs add column if not exists correlation_id text;
alter table public.atlas_structured_logs add column if not exists vercel_request_id text;
alter table public.atlas_structured_logs add column if not exists diagnostic_id text;
alter table public.atlas_structured_logs add column if not exists at timestamptz;
alter table public.atlas_structured_logs add column if not exists user_id text;
alter table public.atlas_structured_logs add column if not exists job_id text;
alter table public.atlas_structured_logs add column if not exists workflow_id text;
alter table public.atlas_structured_logs add column if not exists commander_run_id text;
alter table public.atlas_structured_logs add column if not exists step text;
alter table public.atlas_structured_logs add column if not exists attempt integer;
alter table public.atlas_structured_logs add column if not exists max_attempts integer;
alter table public.atlas_structured_logs add column if not exists failure_class text;
alter table public.atlas_structured_logs add column if not exists message text;
alter table public.atlas_structured_logs add column if not exists cause text;
alter table public.atlas_structured_logs add column if not exists reproduction text;
alter table public.atlas_structured_logs add column if not exists fix_content text;
alter table public.atlas_structured_logs add column if not exists stack_trace text;
alter table public.atlas_structured_logs add column if not exists api_status text;
alter table public.atlas_structured_logs add column if not exists api_response_summary text;
alter table public.atlas_structured_logs add column if not exists duration_ms integer;
alter table public.atlas_structured_logs add column if not exists process_log text;
alter table public.atlas_structured_logs add column if not exists metadata jsonb;
alter table public.atlas_structured_logs add column if not exists created_at timestamptz;

alter table public.atlas_structured_logs alter column metadata set default '{}'::jsonb;
update public.atlas_structured_logs set metadata = '{}'::jsonb where metadata is null;
alter table public.atlas_structured_logs alter column metadata set not null;

create index if not exists atlas_structured_logs_corr_created_idx
  on public.atlas_structured_logs (correlation_id, created_at desc);
create index if not exists atlas_structured_logs_user_created_idx
  on public.atlas_structured_logs (user_id, created_at desc);
create index if not exists atlas_structured_logs_job_created_idx
  on public.atlas_structured_logs (job_id, created_at desc);
create index if not exists atlas_structured_logs_created_idx
  on public.atlas_structured_logs (created_at desc);
create index if not exists atlas_structured_logs_vercel_idx
  on public.atlas_structured_logs (vercel_request_id)
  where vercel_request_id is not null;

alter table public.atlas_structured_logs enable row level security;
drop policy if exists "atlas_structured_logs_deny_anon" on public.atlas_structured_logs;
create policy "atlas_structured_logs_deny_anon"
  on public.atlas_structured_logs
  for all to anon, authenticated
  using (false) with check (false);
