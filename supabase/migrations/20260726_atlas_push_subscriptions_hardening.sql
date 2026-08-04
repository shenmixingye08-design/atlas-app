-- Harden Web Push subscriptions: last_used_at, user_agent, global endpoint uniqueness.
-- Safe to re-run. Apply in Supabase SQL Editor if not using CLI migrations.

alter table if exists public.atlas_push_subscriptions
  add column if not exists user_agent text;

alter table if exists public.atlas_push_subscriptions
  add column if not exists last_used_at timestamptz;

-- Global unique endpoint (one browser push endpoint → one owner row).
-- Drop legacy composite unique if present, then enforce endpoint uniqueness.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'atlas_push_subscriptions_user_id_endpoint_key'
  ) then
    alter table public.atlas_push_subscriptions
      drop constraint atlas_push_subscriptions_user_id_endpoint_key;
  end if;
exception
  when undefined_table then
    null;
end $$;

create unique index if not exists atlas_push_subscriptions_endpoint_uidx
  on public.atlas_push_subscriptions (endpoint);

create index if not exists atlas_push_subscriptions_user_active_idx
  on public.atlas_push_subscriptions (user_id, is_active);

-- Keep RLS deny-all for anon/authenticated (service role only writes).
alter table if exists public.atlas_push_subscriptions enable row level security;

drop policy if exists "atlas_push_subscriptions_deny_anon" on public.atlas_push_subscriptions;

create policy "atlas_push_subscriptions_deny_anon"
  on public.atlas_push_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);
