-- Phase 3-2: Google Drive Live Adapter
-- 1) Encrypt Google OAuth tokens at rest (ciphertext columns + metadata)
-- 2) Durable Drive upload external-action / idempotency evidence

alter table if exists public.atlas_google_oauth_credentials
  add column if not exists access_token_ciphertext text,
  add column if not exists refresh_token_ciphertext text,
  add column if not exists token_type text not null default 'Bearer',
  add column if not exists organization_id text,
  add column if not exists last_refresh_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists atlas_google_oauth_credentials_org_idx
  on public.atlas_google_oauth_credentials (organization_id);

create table if not exists public.atlas_google_drive_upload_actions (
  id text primary key,
  owner_id text not null,
  organization_id text,
  run_id text not null,
  step_id text not null,
  artifact_id text not null,
  target_folder_id text not null,
  idempotency_key text not null,
  file_id text not null,
  web_view_link text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum text not null,
  provider_request_id text,
  provider_status text not null default 'verified',
  adapter_mode text not null default 'production',
  environment text not null,
  diagnostic_id text not null,
  retry_count integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  result_hash text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists atlas_google_drive_upload_actions_owner_run_idx
  on public.atlas_google_drive_upload_actions (owner_id, run_id);

create index if not exists atlas_google_drive_upload_actions_file_idx
  on public.atlas_google_drive_upload_actions (file_id);

alter table public.atlas_google_drive_upload_actions enable row level security;

drop policy if exists "atlas_google_drive_upload_actions_deny_anon"
  on public.atlas_google_drive_upload_actions;

create policy "atlas_google_drive_upload_actions_deny_anon"
  on public.atlas_google_drive_upload_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
