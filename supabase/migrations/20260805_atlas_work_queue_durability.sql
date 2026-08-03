-- Production Blocker #4 — Durability SoT
-- Workers, Executions, Completion Evidence, Recovery events,
-- Metric counters, Locks. Apply after 20260803/20260804.

create table if not exists public.atlas_work_queue_workers (
  worker_id text primary key,
  last_seen_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  busy boolean not null default false,
  lease_count integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'stale', 'stopped'))
);

create table if not exists public.atlas_work_queue_executions (
  execution_id uuid primary key,
  job_id uuid not null references public.atlas_work_queue_jobs(job_id) on delete cascade,
  run_id text not null,
  worker_id text not null,
  attempt integer not null default 0,
  resume_from_step integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text
    check (
      outcome is null
      or outcome in (
        'completed',
        'failed',
        'retried',
        'recovered',
        'interrupted',
        'cancelled'
      )
    ),
  detail jsonb not null default '{}'::jsonb
);

create index if not exists atlas_work_queue_executions_job_idx
  on public.atlas_work_queue_executions (job_id, started_at desc);

create index if not exists atlas_work_queue_executions_worker_idx
  on public.atlas_work_queue_executions (worker_id, started_at desc);

create table if not exists public.atlas_work_queue_completion_evidence (
  evidence_id uuid primary key,
  job_id uuid not null references public.atlas_work_queue_jobs(job_id) on delete cascade,
  run_id text not null,
  step_id text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, step_id, kind)
);

create index if not exists atlas_work_queue_completion_evidence_job_idx
  on public.atlas_work_queue_completion_evidence (job_id);

create table if not exists public.atlas_work_queue_recovery_events (
  event_id uuid primary key,
  job_id uuid references public.atlas_work_queue_jobs(job_id) on delete set null,
  kind text not null
    check (
      kind in (
        'stuck',
        'lease_expired',
        'running_orphan',
        'retry_due',
        'worker_boot'
      )
    ),
  success boolean not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_work_queue_recovery_events_created_idx
  on public.atlas_work_queue_recovery_events (created_at desc);

create table if not exists public.atlas_work_queue_metric_counters (
  counter_key text primary key,
  counter_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_work_queue_locks (
  lock_key text primary key,
  owner text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists atlas_work_queue_locks_expires_idx
  on public.atlas_work_queue_locks (expires_at);

-- Seed metric counter keys used by Blocker #4 dashboards.
insert into public.atlas_work_queue_metric_counters (counter_key, counter_value)
values
  ('retry_count', 0),
  ('recovery_count', 0),
  ('duplicate_count', 0),
  ('timeout_count', 0),
  ('notification_count', 0),
  ('job_started_count', 0),
  ('job_completed_count', 0),
  ('job_failed_count', 0)
on conflict (counter_key) do nothing;

alter table public.atlas_work_queue_workers enable row level security;
alter table public.atlas_work_queue_executions enable row level security;
alter table public.atlas_work_queue_completion_evidence enable row level security;
alter table public.atlas_work_queue_recovery_events enable row level security;
alter table public.atlas_work_queue_metric_counters enable row level security;
alter table public.atlas_work_queue_locks enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "atlas_work_queue_workers_deny" on public.atlas_work_queue_workers;
    create policy "atlas_work_queue_workers_deny"
      on public.atlas_work_queue_workers for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_executions_deny" on public.atlas_work_queue_executions;
    create policy "atlas_work_queue_executions_deny"
      on public.atlas_work_queue_executions for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_completion_evidence_deny"
      on public.atlas_work_queue_completion_evidence;
    create policy "atlas_work_queue_completion_evidence_deny"
      on public.atlas_work_queue_completion_evidence for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_recovery_events_deny"
      on public.atlas_work_queue_recovery_events;
    create policy "atlas_work_queue_recovery_events_deny"
      on public.atlas_work_queue_recovery_events for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_metric_counters_deny"
      on public.atlas_work_queue_metric_counters;
    create policy "atlas_work_queue_metric_counters_deny"
      on public.atlas_work_queue_metric_counters for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_locks_deny" on public.atlas_work_queue_locks;
    create policy "atlas_work_queue_locks_deny"
      on public.atlas_work_queue_locks for all to anon, authenticated
      using (false) with check (false);
  end if;
end $$;
