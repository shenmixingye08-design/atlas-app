-- Durable reliability / SRE event log for 7 / 30 / 90 day windows.
-- Service-role writes only (RLS deny-all for anon/auth).

create table if not exists public.atlas_reliability_events (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  outcome text not null check (outcome in ('success', 'failure', 'retry', 'timeout')),
  duration_ms integer,
  error_code text,
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

alter table public.atlas_reliability_events enable row level security;

drop policy if exists "atlas_reliability_events_deny_anon"
  on public.atlas_reliability_events;
create policy "atlas_reliability_events_deny_anon"
  on public.atlas_reliability_events
  for all to anon, authenticated
  using (false) with check (false);
