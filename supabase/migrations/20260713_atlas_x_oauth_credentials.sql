-- Durable X (Twitter) OAuth credentials for serverless (no .data / stripped Clerk overflow).
-- Apply in Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Writes use the service role key (bypasses RLS). Anon / authenticated cannot access.
-- Tokens are NEVER returned to the browser; only the Next.js server reads this table.

create table if not exists public.atlas_x_oauth_credentials (
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
  account_username text,
  provider_user_id text,
  error_message text,
  updated_at timestamptz not null default now()
);

create index if not exists atlas_x_oauth_credentials_status_idx
  on public.atlas_x_oauth_credentials (connection_status);

alter table public.atlas_x_oauth_credentials enable row level security;

drop policy if exists "atlas_x_oauth_credentials_deny_anon"
  on public.atlas_x_oauth_credentials;

create policy "atlas_x_oauth_credentials_deny_anon"
  on public.atlas_x_oauth_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);
