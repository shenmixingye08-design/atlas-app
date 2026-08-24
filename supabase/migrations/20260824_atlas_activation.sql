-- Activation / onboarding progress and events.
-- Progress SoT: atlas_user_state.atlasActivation
-- Events: this table for owner funnel + per-user domain copy.
-- SAFE: additive. Does not drop or rewrite existing tables.

create table if not exists public.atlas_activation_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_name text not null,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists atlas_activation_events_idempotency_idx
  on public.atlas_activation_events (user_id, event_name, idempotency_key);

create index if not exists atlas_activation_events_occurred_idx
  on public.atlas_activation_events (occurred_at desc);

alter table public.atlas_activation_events enable row level security;

drop policy if exists "atlas_activation_events_deny_all" on public.atlas_activation_events;

create policy "atlas_activation_events_deny_all"
  on public.atlas_activation_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_activation_events is
  'Activation funnel events. No prompts, artifacts, tokens, or payment details. Service role only. Retention target: 400 days. Owners read via /api/owner/activation-funnel. Users cannot read other users.';
