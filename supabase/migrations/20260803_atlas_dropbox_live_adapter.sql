-- Phase 3-5: Dropbox Production Live Adapter
-- 1) Encrypt Dropbox OAuth tokens at rest (dedicated table + ciphertext columns)
-- 2) Durable Dropbox upload external-action / idempotency evidence

create table if not exists public.atlas_dropbox_oauth_credentials (
  user_id text primary key,
  access_token text not null,
  refresh_token text not null,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  expires_at timestamptz not null,
  scope text not null default '',
  token_type text not null default 'Bearer',
  organization_id text,
  connection_status text not null default 'disconnected',
  connected_at timestamptz,
  last_used_at timestamptz,
  last_refresh_at timestamptz,
  revoked_at timestamptz,
  account_email text,
  account_name text,
  account_picture_url text,
  account_provider_user_id text,
  error_message text,
  updated_at timestamptz not null default now()
);

create index if not exists atlas_dropbox_oauth_credentials_status_idx
  on public.atlas_dropbox_oauth_credentials (connection_status);

create index if not exists atlas_dropbox_oauth_credentials_org_idx
  on public.atlas_dropbox_oauth_credentials (organization_id);

alter table public.atlas_dropbox_oauth_credentials enable row level security;

drop policy if exists "atlas_dropbox_oauth_credentials_deny_anon"
  on public.atlas_dropbox_oauth_credentials;

create policy "atlas_dropbox_oauth_credentials_deny_anon"
  on public.atlas_dropbox_oauth_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_dropbox_upload_actions (
  id text primary key,
  owner_id text not null,
  organization_id text,
  run_id text not null,
  step_id text not null,
  artifact_id text not null,
  target_path text not null,
  idempotency_key text not null,
  file_id text not null,
  path_display text not null,
  rev text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  content_hash text not null,
  shared_link_url text,
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

create index if not exists atlas_dropbox_upload_actions_owner_run_idx
  on public.atlas_dropbox_upload_actions (owner_id, run_id);

create index if not exists atlas_dropbox_upload_actions_file_idx
  on public.atlas_dropbox_upload_actions (file_id);

alter table public.atlas_dropbox_upload_actions enable row level security;

drop policy if exists "atlas_dropbox_upload_actions_deny_anon"
  on public.atlas_dropbox_upload_actions;

create policy "atlas_dropbox_upload_actions_deny_anon"
  on public.atlas_dropbox_upload_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
