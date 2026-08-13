-- Phase 4: durable condition / event trigger evaluation state.
-- Process memory must never be the sole source of truth for lastConditionState.

create table if not exists public.atlas_automation_trigger_state (
  automation_id uuid primary key references public.atlas_automations (id) on delete cascade,
  user_id text not null,
  trigger_type text not null check (trigger_type in ('condition', 'event')),
  trigger_version integer not null default 1,
  last_evaluated_at timestamptz,
  last_condition_state boolean,
  last_triggered_at timestamptz,
  last_occurrence_key text,
  last_event_id text,
  last_provider_resource_id text,
  triggered_resource_ids jsonb not null default '[]'::jsonb,
  evaluation_lease_owner text,
  evaluation_lease_until timestamptz,
  last_evaluation_error text,
  evaluation_attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_automation_trigger_state_user_idx
  on public.atlas_automation_trigger_state (user_id);

create index if not exists atlas_automation_trigger_state_lease_idx
  on public.atlas_automation_trigger_state (evaluation_lease_until)
  where evaluation_lease_until is not null;

alter table public.atlas_automation_trigger_state enable row level security;

drop policy if exists "atlas_automation_trigger_state_deny_anon"
  on public.atlas_automation_trigger_state;
create policy "atlas_automation_trigger_state_deny_anon"
  on public.atlas_automation_trigger_state
  for all
  to anon, authenticated
  using (false)
  with check (false);
