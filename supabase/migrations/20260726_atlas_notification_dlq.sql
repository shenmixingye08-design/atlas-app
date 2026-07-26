-- Dead letter queue for notification delivery failures.
-- Fire-and-forget is forbidden: failed ACK → retry → DLQ.

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
