-- Durable overflow store when Clerk privateMetadata cannot hold full payloads.
-- Apply in Supabase SQL editor when NEXT_PUBLIC_SUPABASE_* is configured.

create table if not exists public.atlas_user_state (
  user_id text not null,
  domain text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, domain)
);

alter table public.atlas_user_state enable row level security;

-- Revoke open access. Server writes must use the service role key
-- (bypasses RLS). Anon / authenticated clients cannot read or write.
drop policy if exists "atlas_user_state_all" on public.atlas_user_state;
drop policy if exists "atlas_user_state_deny_anon" on public.atlas_user_state;

create policy "atlas_user_state_deny_anon"
  on public.atlas_user_state
  for all
  to anon, authenticated
  using (false)
  with check (false);
