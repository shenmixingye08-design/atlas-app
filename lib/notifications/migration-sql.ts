/**
 * Inline SQL for Production apply / health probe.
 * Mirrors:
 * - supabase/migrations/20260804_p0_4_durable_user_notifications.sql
 * - supabase/migrations/20260726_atlas_notification_dlq.sql
 * SAFE: additive IF NOT EXISTS / IF NOT EXISTS indexes. No destructive changes.
 */
export const ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL = `
-- P0-4: Durable per-user notification inbox (row SoT).
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
    check (retry_count >= 0 and max_retries >= 0 and retry_count <= max_retries + 1)
);

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

revoke all on public.atlas_user_notifications from anon, authenticated;
grant all on public.atlas_user_notifications to service_role;

-- Dead letter queue for notification delivery failures.
create table if not exists public.atlas_notification_dlq (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null,
  user_id text not null,
  channel text not null,
  title text not null,
  message text not null,
  attempt_count integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'dead'
    check (status in ('pending_retry', 'dead', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_notification_dlq_user_status_idx
  on public.atlas_notification_dlq (user_id, status, created_at desc);

create index if not exists atlas_notification_dlq_status_idx
  on public.atlas_notification_dlq (status, created_at desc);

alter table public.atlas_notification_dlq enable row level security;

drop policy if exists "atlas_notification_dlq_deny_anon"
  on public.atlas_notification_dlq;
create policy "atlas_notification_dlq_deny_anon"
  on public.atlas_notification_dlq
  for all to anon, authenticated
  using (false) with check (false);

revoke all on public.atlas_notification_dlq from anon, authenticated;
grant all on public.atlas_notification_dlq to service_role;

-- Refresh PostgREST schema cache so new tables are visible immediately.
notify pgrst, 'reload schema';
`;
