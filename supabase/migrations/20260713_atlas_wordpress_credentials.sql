-- Durable WordPress Application Password credentials (encrypted at rest).
-- Apply in Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Writes use the service role key (bypasses RLS). Anon / authenticated cannot access.
-- application_password_ciphertext is AES-256-GCM (iv:tag:ciphertext base64).
-- Secrets are NEVER returned to the browser; only the Next.js server reads this table.

create table if not exists public.atlas_wordpress_credentials (
  user_id text primary key,
  site_url text not null,
  username text not null,
  application_password_ciphertext text not null,
  connection_status text not null default 'disconnected',
  connected_at timestamptz,
  last_used_at timestamptz,
  site_name text,
  account_name text,
  error_message text,
  updated_at timestamptz not null default now()
);

create index if not exists atlas_wordpress_credentials_status_idx
  on public.atlas_wordpress_credentials (connection_status);

alter table public.atlas_wordpress_credentials enable row level security;

drop policy if exists "atlas_wordpress_credentials_deny_anon"
  on public.atlas_wordpress_credentials;

create policy "atlas_wordpress_credentials_deny_anon"
  on public.atlas_wordpress_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);
