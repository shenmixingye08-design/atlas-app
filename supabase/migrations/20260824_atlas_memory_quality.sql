-- Memory production hardening.
-- Personal / Work Memory SoT remains atlas_user_state domains:
--   atlasPersonalMemory, atlasWorkMemory, atlasMemoryApplyLog, atlasMemoryQuality
-- Candidates live inside atlasPersonalMemory.memories (status=candidate)
-- and atlasWorkMemory.candidates. Never process-memory-only.
-- SAFE: additive. Does not drop or rewrite atlas_user_state.

create table if not exists public.atlas_memory_quality_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  channel text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_memory_quality_events_user_created_idx
  on public.atlas_memory_quality_events (user_id, created_at desc);

alter table public.atlas_memory_quality_events enable row level security;

drop policy if exists "atlas_memory_quality_events_deny_all" on public.atlas_memory_quality_events;

create policy "atlas_memory_quality_events_deny_all"
  on public.atlas_memory_quality_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_memory_quality_events is
  'Optional durable overflow for Memory quality indicators. Primary SoT is atlas_user_state.atlasMemoryQuality. Server writes use service role; clients cannot read or write.';
