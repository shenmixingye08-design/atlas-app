-- Phase 3-4: Google Calendar Live Adapter
-- 1) Encrypt Google OAuth tokens at rest (ciphertext columns + metadata)
-- 2) Durable Calendar external-action / idempotency evidence

alter table if exists public.atlas_google_oauth_credentials
  add column if not exists access_token_ciphertext text,
  add column if not exists refresh_token_ciphertext text,
  add column if not exists token_type text not null default 'Bearer',
  add column if not exists organization_id text,
  add column if not exists last_refresh_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists atlas_google_oauth_credentials_org_idx
  on public.atlas_google_oauth_credentials (organization_id);

create table if not exists public.atlas_google_calendar_actions (
  id text primary key,
  owner_id text not null,
  organization_id text,
  run_id text not null,
  step_id text not null,
  action text not null,
  calendar_id text not null,
  event_id text not null,
  html_link text,
  hangout_link text,
  title_hash text not null,
  start_date_time text not null,
  end_date_time text not null,
  timezone text not null,
  attendee_hash text not null,
  status text not null default 'verified',
  adapter_mode text not null default 'production',
  environment text not null,
  provider_request_id text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  retry_count integer not null default 0,
  idempotency_key text not null,
  diagnostic_id text not null,
  result_hash text not null,
  approval_id text,
  conflict_warned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists atlas_google_calendar_actions_owner_run_idx
  on public.atlas_google_calendar_actions (owner_id, run_id);

create index if not exists atlas_google_calendar_actions_event_idx
  on public.atlas_google_calendar_actions (event_id);

alter table public.atlas_google_calendar_actions enable row level security;

drop policy if exists "atlas_google_calendar_actions_deny_anon"
  on public.atlas_google_calendar_actions;

create policy "atlas_google_calendar_actions_deny_anon"
  on public.atlas_google_calendar_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
