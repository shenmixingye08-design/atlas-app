-- Web Push subscription storage (multi-device per Clerk user).
-- Apply in Supabase SQL editor when NEXT_PUBLIC_SUPABASE_* is configured.
-- Server writes use service role (RLS deny-all for anon/auth).

create table if not exists public.atlas_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  platform text,
  browser text,
  device_name text,
  failure_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists atlas_push_subscriptions_user_active_idx
  on public.atlas_push_subscriptions (user_id, is_active);

alter table public.atlas_push_subscriptions enable row level security;

drop policy if exists "atlas_push_subscriptions_deny_anon" on public.atlas_push_subscriptions;

create policy "atlas_push_subscriptions_deny_anon"
  on public.atlas_push_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);
