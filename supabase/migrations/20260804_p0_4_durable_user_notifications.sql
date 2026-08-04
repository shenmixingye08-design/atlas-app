-- P0-4: Durable per-user notification inbox (row SoT).
-- Idempotent. Rollback: drop table/indexes (user data lost — export first).
-- Apply after atlas_user_state. Partial apply safe via IF NOT EXISTS.
-- Production without this migration: createUserNotification fail-closes (no memory SoT).

create table if not exists public.atlas_user_notifications (
  notification_id text primary key,
  owner_id text not null,
  organization_id text,
  audience text not null default 'user',
  source_type text,
  source_id text,
  event_type text not null,
  channel text not null default 'in_app',
  title text not null,
  body text not null,
  severity text,
  status text not null default 'pending',
  read_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  max_retries integer not null default 5,
  idempotency_key text not null,
  diagnostic_id text,
  metadata jsonb not null default '{}'::jsonb,
  related_task_id text,
  related_service text,
  action_url text,
  target_type text,
  target_id text,
  workflow_run_id text,
  deliverable_id text,
  request_id text,
  automation_id text,
  line_event text,
  event_category text,
  push_sent_at timestamptz,
  push_failed_at timestamptz,
  push_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  constraint atlas_user_notifications_audience_check
    check (audience in ('user', 'owner')),
  constraint atlas_user_notifications_channel_check
    check (channel in ('in_app', 'email', 'line', 'slack', 'push')),
  constraint atlas_user_notifications_status_check
    check (status in (
      'pending',
      'delivered',
      'failed',
      'retry_scheduled',
      'suppressed',
      'read'
    )),
  constraint atlas_user_notifications_retry_check
    check (retry_count >= 0 and max_retries >= 0 and retry_count <= max_retries + 1),
  constraint atlas_user_notifications_read_at_check
    check (
      (read_at is null and status <> 'read')
      or (read_at is not null)
      or status in ('pending', 'delivered', 'failed', 'retry_scheduled', 'suppressed', 'read')
    )
);

-- Idempotency: same owner+event+channel+version cannot duplicate
create unique index if not exists atlas_user_notifications_idempotency_uidx
  on public.atlas_user_notifications (owner_id, idempotency_key)
  where deleted_at is null;

create index if not exists atlas_user_notifications_owner_created_idx
  on public.atlas_user_notifications (owner_id, created_at desc)
  where deleted_at is null;

create index if not exists atlas_user_notifications_owner_unread_idx
  on public.atlas_user_notifications (owner_id, created_at desc)
  where deleted_at is null and read_at is null;

create index if not exists atlas_user_notifications_org_idx
  on public.atlas_user_notifications (organization_id, created_at desc)
  where organization_id is not null and deleted_at is null;

create index if not exists atlas_user_notifications_expires_idx
  on public.atlas_user_notifications (expires_at)
  where expires_at is not null and deleted_at is null;

create index if not exists atlas_user_notifications_retry_idx
  on public.atlas_user_notifications (next_retry_at)
  where status = 'retry_scheduled' and deleted_at is null;

alter table public.atlas_user_notifications enable row level security;

drop policy if exists "atlas_user_notifications_deny_anon"
  on public.atlas_user_notifications;
create policy "atlas_user_notifications_deny_anon"
  on public.atlas_user_notifications
  for all to anon, authenticated
  using (false) with check (false);

comment on table public.atlas_user_notifications is
  'P0-4 Durable per-user inbox. Service role only. No global shared buffer.';
