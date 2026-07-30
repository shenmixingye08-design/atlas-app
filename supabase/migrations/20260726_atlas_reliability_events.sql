-- Durable reliability / SRE event log for 7 / 30 / 90 day windows + job diagnostics.
-- Service-role writes only (RLS deny-all for anon/auth).
-- Does NOT store secrets, tokens, or image/binary bodies.
-- Extended columns are also ensured by 20260730_atlas_reliability_events_diagnostics.sql.

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

create index if not exists atlas_reliability_events_created_idx
  on public.atlas_reliability_events (created_at desc);

create index if not exists atlas_reliability_events_key_created_idx
  on public.atlas_reliability_events (metric_key, created_at desc);

create index if not exists atlas_reliability_events_outcome_created_idx
  on public.atlas_reliability_events (outcome, created_at desc);

create index if not exists atlas_reliability_events_job_created_idx
  on public.atlas_reliability_events (job_id, created_at desc);

alter table public.atlas_reliability_events enable row level security;

drop policy if exists "atlas_reliability_events_deny_anon"
  on public.atlas_reliability_events;
create policy "atlas_reliability_events_deny_anon"
  on public.atlas_reliability_events
  for all to anon, authenticated
  using (false) with check (false);
