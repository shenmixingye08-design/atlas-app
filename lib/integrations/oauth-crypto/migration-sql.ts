import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * SQL source for P0-02 OAuth token encryption migration.
 * Prefer reading the canonical file; fall back to inline for bundled runtimes.
 */
export function loadOAuthTokenEncryptionMigrationSql(): string {
  try {
    return readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260808_p0_02_oauth_token_encryption.sql",
      ),
      "utf8",
    );
  } catch {
    return ATLAS_OAUTH_TOKEN_ENCRYPTION_MIGRATION_SQL_FALLBACK;
  }
}

/** Fallback copy kept in sync with supabase/migrations/20260808_p0_02_oauth_token_encryption.sql */
export const ATLAS_OAUTH_TOKEN_ENCRYPTION_MIGRATION_SQL_FALLBACK = `
alter table if exists public.atlas_google_oauth_credentials
  add column if not exists encryption_key_version integer;

alter table if exists public.atlas_x_oauth_credentials
  add column if not exists encryption_key_version integer;

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
`.trim();
