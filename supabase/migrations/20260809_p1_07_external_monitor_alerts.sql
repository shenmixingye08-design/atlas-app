-- P1-07: External monitoring / alert incidents (Production DB SoT).
-- Durable across multi-instance / cold start / redeploy.
-- SAFE: additive only. Service role writes; anon/authenticated denied via RLS.

-- ---------------------------------------------------------------------------
-- Monitor check runs (heartbeat + metric snapshots)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_monitor_check_runs (
  id text primary key,
  check_id text not null,
  status text not null,
  severity text not null default 'ok',
  observed_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  instance_id text,
  synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  constraint atlas_monitor_check_runs_status_check
    check (status in ('ok', 'warning', 'high', 'critical')),
  constraint atlas_monitor_check_runs_severity_check
    check (severity in ('ok', 'warning', 'high', 'critical'))
);

create index if not exists atlas_monitor_check_runs_check_observed_idx
  on public.atlas_monitor_check_runs (check_id, observed_at desc);

alter table public.atlas_monitor_check_runs enable row level security;

drop policy if exists "atlas_monitor_check_runs_deny_anon"
  on public.atlas_monitor_check_runs;
create policy "atlas_monitor_check_runs_deny_anon"
  on public.atlas_monitor_check_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Alert incidents (open / resolved lifecycle)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_alert_incidents (
  id text primary key,
  fingerprint text not null,
  check_id text not null,
  severity text not null,
  status text not null default 'open',
  title text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  failure_class text not null default 'internal',
  affected_users_estimate integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_notified_at timestamptz,
  notify_count integer not null default 0,
  continuation_count integer not null default 0,
  claim_owner text,
  claim_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_alert_incidents_severity_check
    check (severity in ('warning', 'high', 'critical')),
  constraint atlas_alert_incidents_status_check
    check (status in ('open', 'acknowledged', 'resolved')),
  constraint atlas_alert_incidents_failure_class_check
    check (failure_class in ('internal', 'external_provider', 'mixed', 'unknown'))
);

create unique index if not exists atlas_alert_incidents_open_fingerprint_uidx
  on public.atlas_alert_incidents (fingerprint)
  where status = 'open';

create index if not exists atlas_alert_incidents_status_seen_idx
  on public.atlas_alert_incidents (status, last_seen_at desc);

alter table public.atlas_alert_incidents enable row level security;

drop policy if exists "atlas_alert_incidents_deny_anon"
  on public.atlas_alert_incidents;
create policy "atlas_alert_incidents_deny_anon"
  on public.atlas_alert_incidents
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Alert deliveries (dedupe + single-winner claim evidence)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_alert_deliveries (
  id text primary key,
  incident_id text not null references public.atlas_alert_incidents(id) on delete cascade,
  delivery_kind text not null,
  channel text not null,
  status text not null default 'claimed',
  dedupe_key text not null,
  claimed_by text not null,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint atlas_alert_deliveries_kind_check
    check (delivery_kind in ('opened', 'continuation', 'resolved')),
  constraint atlas_alert_deliveries_channel_check
    check (channel in ('line', 'system', 'probe')),
  constraint atlas_alert_deliveries_status_check
    check (status in ('claimed', 'sent', 'failed', 'skipped'))
);

create unique index if not exists atlas_alert_deliveries_dedupe_uidx
  on public.atlas_alert_deliveries (dedupe_key);

create index if not exists atlas_alert_deliveries_incident_idx
  on public.atlas_alert_deliveries (incident_id, created_at desc);

alter table public.atlas_alert_deliveries enable row level security;

drop policy if exists "atlas_alert_deliveries_deny_anon"
  on public.atlas_alert_deliveries;
create policy "atlas_alert_deliveries_deny_anon"
  on public.atlas_alert_deliveries
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Synthetic failure injections (isolated; never mutates user jobs)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_monitor_injections (
  id text primary key,
  injection_kind text not null,
  active boolean not null default true,
  expires_at timestamptz not null,
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  constraint atlas_monitor_injections_kind_check
    check (injection_kind in (
      'tick_failure',
      'worker_stale',
      'dlq_spike',
      'notification_failure',
      'side_effect_failure'
    ))
);

create index if not exists atlas_monitor_injections_active_idx
  on public.atlas_monitor_injections (active, expires_at)
  where active = true;

alter table public.atlas_monitor_injections enable row level security;

drop policy if exists "atlas_monitor_injections_deny_anon"
  on public.atlas_monitor_injections;
create policy "atlas_monitor_injections_deny_anon"
  on public.atlas_monitor_injections
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Atomic single-winner delivery claim (unique dedupe_key).
create or replace function public.atlas_claim_alert_delivery(
  p_id text,
  p_incident_id text,
  p_delivery_kind text,
  p_channel text,
  p_dedupe_key text,
  p_claimed_by text
)
returns public.atlas_alert_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.atlas_alert_deliveries;
begin
  insert into public.atlas_alert_deliveries (
    id,
    incident_id,
    delivery_kind,
    channel,
    status,
    dedupe_key,
    claimed_by,
    claimed_at
  ) values (
    p_id,
    p_incident_id,
    p_delivery_kind,
    p_channel,
    'claimed',
    p_dedupe_key,
    p_claimed_by,
    now()
  )
  on conflict (dedupe_key) do nothing
  returning * into row;

  if not found then
    return null;
  end if;
  return row;
end;
$$;

revoke all on function public.atlas_claim_alert_delivery(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.atlas_claim_alert_delivery(text, text, text, text, text, text)
  to service_role;
