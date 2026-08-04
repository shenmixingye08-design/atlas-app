/**
 * Inline SQL so the Production serverless function can apply schema
 * even when supabase/migrations is not present in the deploy artifact.
 */
export const ATLAS_RELIABILITY_EVENTS_MIGRATION_SQL = `
create table if not exists public.atlas_reliability_events (
  id uuid primary key default gen_random_uuid(),
  metric_key text,
  outcome text check (outcome is null or outcome in ('success', 'failure', 'retry', 'timeout')),
  duration_ms integer,
  job_id text,
  diagnostic_id text,
  user_id text,
  stage text,
  severity text check (severity is null or severity in ('info', 'warn', 'error', 'critical')),
  error_code text,
  message text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.atlas_reliability_events add column if not exists job_id text;
alter table public.atlas_reliability_events add column if not exists diagnostic_id text;
alter table public.atlas_reliability_events add column if not exists user_id text;
alter table public.atlas_reliability_events add column if not exists stage text;
alter table public.atlas_reliability_events add column if not exists severity text;
alter table public.atlas_reliability_events add column if not exists message text;
alter table public.atlas_reliability_events add column if not exists error_message text;
alter table public.atlas_reliability_events add column if not exists metric_key text;
alter table public.atlas_reliability_events add column if not exists outcome text;
alter table public.atlas_reliability_events add column if not exists duration_ms integer;
alter table public.atlas_reliability_events add column if not exists error_code text;
alter table public.atlas_reliability_events add column if not exists metadata jsonb;
alter table public.atlas_reliability_events alter column metadata set default '{}'::jsonb;
update public.atlas_reliability_events set metadata = '{}'::jsonb where metadata is null;
alter table public.atlas_reliability_events alter column metadata set not null;
update public.atlas_reliability_events set message = error_message where message is null and error_message is not null;
update public.atlas_reliability_events set error_message = message where error_message is null and message is not null;

create index if not exists atlas_reliability_events_created_idx on public.atlas_reliability_events (created_at desc);
create index if not exists atlas_reliability_events_key_created_idx on public.atlas_reliability_events (metric_key, created_at desc);
create index if not exists atlas_reliability_events_outcome_created_idx on public.atlas_reliability_events (outcome, created_at desc);
create index if not exists atlas_reliability_events_job_created_idx on public.atlas_reliability_events (job_id, created_at desc);
create index if not exists atlas_reliability_events_diag_created_idx on public.atlas_reliability_events (diagnostic_id, created_at desc);
create index if not exists atlas_reliability_events_stage_created_idx on public.atlas_reliability_events (stage, created_at desc);

alter table public.atlas_reliability_events enable row level security;
drop policy if exists "atlas_reliability_events_deny_anon" on public.atlas_reliability_events;
create policy "atlas_reliability_events_deny_anon"
  on public.atlas_reliability_events
  for all to anon, authenticated
  using (false) with check (false);
`.trim();
