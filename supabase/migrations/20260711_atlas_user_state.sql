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

-- Anon key writes are used by the app today (same pattern as projects).
-- Tighten policies once Clerk JWT ↔ Supabase auth bridging is enabled.
create policy "atlas_user_state_all"
  on public.atlas_user_state
  for all
  using (true)
  with check (true);
