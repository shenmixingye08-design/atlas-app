-- Scheduler dedicated registry + execution logs (Production Blocker #2).
-- SoT for schedule lifecycle: Scheduled → Running → Completed / Failed.
-- Apply after 20260802 / 20260803 work-queue migrations.

create table if not exists public.atlas_scheduler_schedules (
  schedule_id text primary key,
  automation_id text not null,
  owner_id text not null,
  cron_expression text not null,
  timezone text not null default 'Asia/Tokyo',
  preset_type text not null,
  next_run timestamptz,
  last_run timestamptz,
  last_success timestamptz,
  last_failure timestamptz,
  retry_count integer not null default 0,
  execution_time timestamptz,
  duration_ms integer,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'completed', 'failed', 'stopped')),
  enabled boolean not null default true,
  idempotency_key text,
  lock_owner text,
  lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id)
);

create index if not exists atlas_scheduler_schedules_next_run_idx
  on public.atlas_scheduler_schedules (enabled, status, next_run)
  where enabled = true;

create index if not exists atlas_scheduler_schedules_owner_idx
  on public.atlas_scheduler_schedules (owner_id, status);

create table if not exists public.atlas_scheduler_execution_logs (
  log_id uuid primary key,
  schedule_id text not null references public.atlas_scheduler_schedules(schedule_id) on delete cascade,
  automation_id text not null,
  owner_id text not null,
  job_id uuid,
  occurrence_key text not null,
  idempotency_key text not null,
  status text not null
    check (status in ('scheduled', 'running', 'completed', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists atlas_scheduler_execution_logs_schedule_idx
  on public.atlas_scheduler_execution_logs (schedule_id, created_at desc);

create index if not exists atlas_scheduler_execution_logs_occurrence_idx
  on public.atlas_scheduler_execution_logs (automation_id, occurrence_key);

alter table public.atlas_scheduler_schedules enable row level security;
alter table public.atlas_scheduler_execution_logs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "atlas_scheduler_schedules_deny" on public.atlas_scheduler_schedules;
    create policy "atlas_scheduler_schedules_deny"
      on public.atlas_scheduler_schedules for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_scheduler_execution_logs_deny" on public.atlas_scheduler_execution_logs;
    create policy "atlas_scheduler_execution_logs_deny"
      on public.atlas_scheduler_execution_logs for all to anon, authenticated
      using (false) with check (false);
  end if;
end $$;
