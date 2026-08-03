-- Phase 3-3: Gmail Live Adapter
-- 1) Encrypt Google OAuth tokens at rest (ciphertext columns + metadata)
-- 2) Durable Gmail external-action / idempotency evidence

alter table if exists public.atlas_google_oauth_credentials
  add column if not exists access_token_ciphertext text,
  add column if not exists refresh_token_ciphertext text,
  add column if not exists token_type text not null default 'Bearer',
  add column if not exists organization_id text,
  add column if not exists last_refresh_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists atlas_google_oauth_credentials_org_idx
  on public.atlas_google_oauth_credentials (organization_id);

create table if not exists public.atlas_gmail_external_actions (
  id text primary key,
  owner_id text not null,
  organization_id text,
  run_id text not null,
  step_id text not null,
  action text not null,
  idempotency_key text not null,
  draft_id text,
  message_id text,
  thread_id text,
  recipient_hash text not null,
  subject_hash text not null,
  body_hash text not null,
  attachment_hash text not null,
  attachment_ids jsonb not null default '[]'::jsonb,
  attachment_count integer not null default 0,
  status text not null default 'verified',
  adapter_mode text not null default 'production',
  environment text not null,
  diagnostic_id text not null,
  retry_count integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  provider_request_id text,
  result_hash text not null,
  approval_id text,
  delivery_guarantee text not null default 'not_applicable',
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists atlas_gmail_external_actions_owner_run_idx
  on public.atlas_gmail_external_actions (owner_id, run_id);

create index if not exists atlas_gmail_external_actions_message_idx
  on public.atlas_gmail_external_actions (message_id);

create index if not exists atlas_gmail_external_actions_draft_idx
  on public.atlas_gmail_external_actions (draft_id);

alter table public.atlas_gmail_external_actions enable row level security;

drop policy if exists "atlas_gmail_external_actions_deny_anon"
  on public.atlas_gmail_external_actions;

create policy "atlas_gmail_external_actions_deny_anon"
  on public.atlas_gmail_external_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
