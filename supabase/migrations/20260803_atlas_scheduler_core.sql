-- Scheduler Core Unification (Phase 2-2)
-- Durable schedule index, tick history, occurrence links, outbox.
-- Source of truth: Postgres. Not process memory.

create table if not exists public.atlas_scheduler_schedules (
  automation_id text primary key,
  owner_id text not null,
  environment text not null default 'production',
  enabled boolean not null default true,
  paused boolean not null default false,
  deleted_at timestamptz,
  next_run_at timestamptz,
  timezone text not null default 'Asia/Tokyo',
  end_at timestamptz,
  misfire_policy text not null default 'run_once_immediately',
  name text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists atlas_scheduler_schedules_due_idx
  on public.atlas_scheduler_schedules (environment, enabled, paused, next_run_at)
  where deleted_at is null and enabled = true and paused = false and next_run_at is not null;

create index if not exists atlas_scheduler_schedules_owner_idx
  on public.atlas_scheduler_schedules (owner_id, environment);

create table if not exists public.atlas_scheduler_ticks (
  scheduler_tick_id text primary key,
  request_id text not null,
  environment text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer,
  due_count integer not null default 0,
  occurrence_created_count integer not null default 0,
  duplicate_skipped_count integer not null default 0,
  invalid_schedule_count integer not null default 0,
  failed_count integer not null default 0,
  outbox_created_count integer not null default 0,
  next_run_updated_count integer not null default 0,
  misfire_skipped_count integer not null default 0,
  status text not null,
  error_code text,
  diagnostic_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists atlas_scheduler_ticks_started_idx
  on public.atlas_scheduler_ticks (started_at desc);

create table if not exists public.atlas_scheduler_tick_occurrences (
  tick_id text not null references public.atlas_scheduler_ticks(scheduler_tick_id) on delete cascade,
  occurrence_key text not null,
  automation_id text not null,
  owner_id text not null,
  run_id text not null,
  job_id text not null,
  scheduled_at timestamptz not null,
  created boolean not null,
  misfire_policy text not null,
  misfire_action text not null,
  reason text,
  primary key (tick_id, occurrence_key)
);

create unique index if not exists atlas_scheduler_occurrence_key_uidx
  on public.atlas_scheduler_tick_occurrences (occurrence_key)
  where created = true;

create table if not exists public.atlas_scheduler_outbox (
  outbox_id text primary key,
  tick_id text not null,
  occurrence_key text not null,
  automation_id text not null,
  owner_id text not null,
  run_id text not null,
  job_id text not null,
  scheduled_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempt integer not null default 0,
  dispatched_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_key, job_id)
);

create index if not exists atlas_scheduler_outbox_pending_idx
  on public.atlas_scheduler_outbox (status, available_at)
  where status in ('pending', 'failed');

alter table public.atlas_scheduler_schedules enable row level security;
alter table public.atlas_scheduler_ticks enable row level security;
alter table public.atlas_scheduler_tick_occurrences enable row level security;
alter table public.atlas_scheduler_outbox enable row level security;

drop policy if exists "atlas_scheduler_schedules_deny" on public.atlas_scheduler_schedules;
create policy "atlas_scheduler_schedules_deny"
  on public.atlas_scheduler_schedules for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_scheduler_ticks_deny" on public.atlas_scheduler_ticks;
create policy "atlas_scheduler_ticks_deny"
  on public.atlas_scheduler_ticks for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_scheduler_tick_occurrences_deny" on public.atlas_scheduler_tick_occurrences;
create policy "atlas_scheduler_tick_occurrences_deny"
  on public.atlas_scheduler_tick_occurrences for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "atlas_scheduler_outbox_deny" on public.atlas_scheduler_outbox;
create policy "atlas_scheduler_outbox_deny"
  on public.atlas_scheduler_outbox for all to anon, authenticated
  using (false) with check (false);
