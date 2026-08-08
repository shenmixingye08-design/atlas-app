-- P0-02: OAuth token encryption at rest (Google / X / Dropbox).
-- access_token / refresh_token columns store AES-256-GCM ciphertext:
--   enc:v{version}:{iv_b64}:{tag_b64}:{ciphertext_b64}
-- encryption_key_version records the key version used for the row.
-- Application refuses plaintext writes when ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY is set
-- (required in production). Legacy plaintext rows are lazily re-encrypted on next load+persist.

-- Google
alter table if exists public.atlas_google_oauth_credentials
  add column if not exists encryption_key_version integer;

comment on column public.atlas_google_oauth_credentials.access_token is
  'AES-256-GCM ciphertext (enc:v…); legacy plaintext may exist until lazy migrate';
comment on column public.atlas_google_oauth_credentials.refresh_token is
  'AES-256-GCM ciphertext (enc:v…); legacy plaintext may exist until lazy migrate';
comment on column public.atlas_google_oauth_credentials.encryption_key_version is
  'Key version used to encrypt access/refresh tokens (null = legacy plaintext)';

-- X
alter table if exists public.atlas_x_oauth_credentials
  add column if not exists encryption_key_version integer;

comment on column public.atlas_x_oauth_credentials.access_token is
  'AES-256-GCM ciphertext (enc:v…); legacy plaintext may exist until lazy migrate';
comment on column public.atlas_x_oauth_credentials.refresh_token is
  'AES-256-GCM ciphertext (enc:v…); legacy plaintext may exist until lazy migrate';
comment on column public.atlas_x_oauth_credentials.encryption_key_version is
  'Key version used to encrypt access/refresh tokens (null = legacy plaintext)';

-- Dropbox (new durable encrypted table — was memory-only / plaintext overflow)
create table if not exists public.atlas_dropbox_oauth_credentials (
  user_id text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null default '',
  connection_status text not null default 'disconnected',
  connected_at timestamptz,
  last_used_at timestamptz,
  account_email text,
  account_name text,
  account_picture_url text,
  provider_user_id text,
  error_message text,
  encryption_key_version integer,
  updated_at timestamptz not null default now()
);

create index if not exists atlas_dropbox_oauth_credentials_status_idx
  on public.atlas_dropbox_oauth_credentials (connection_status);

alter table public.atlas_dropbox_oauth_credentials enable row level security;

drop policy if exists "atlas_dropbox_oauth_credentials_deny_anon"
  on public.atlas_dropbox_oauth_credentials;

create policy "atlas_dropbox_oauth_credentials_deny_anon"
  on public.atlas_dropbox_oauth_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_dropbox_oauth_credentials is
  'Dropbox OAuth tokens at rest (AES-256-GCM). Service role only.';
comment on column public.atlas_dropbox_oauth_credentials.access_token is
  'AES-256-GCM ciphertext (enc:v…)';
comment on column public.atlas_dropbox_oauth_credentials.refresh_token is
  'AES-256-GCM ciphertext (enc:v…)';
