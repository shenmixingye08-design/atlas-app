#!/usr/bin/env node
/**
 * P3-01: Sync Supabase JWT secret into Postgres bridge table (service-role only).
 * Uses GitHub Actions secrets: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 * (or DATABASE_URL / POSTGRES_URL for SQL apply).
 *
 * Never prints the secret value.
 */
import { randomBytes } from "node:crypto";

const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() ||
  "";
const ref = process.env.SUPABASE_PROJECT_REF?.trim() || "";

if (!token || !ref) {
  console.error(
    "sync_jwt_rls_bridge_secret=fail reason=missing_SUPABASE_ACCESS_TOKEN_or_PROJECT_REF",
  );
  process.exit(1);
}

const postgrestRes = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/postgrest`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  },
);
if (!postgrestRes.ok) {
  const text = await postgrestRes.text();
  console.error(
    `sync_jwt_rls_bridge_secret=fail reason=postgrest_${postgrestRes.status} body=${text.slice(0, 200)}`,
  );
  process.exit(1);
}
const postgrest = await postgrestRes.json();
const secret =
  typeof postgrest.jwt_secret === "string" ? postgrest.jwt_secret.trim() : "";
if (!secret || secret.length < 16) {
  console.error("sync_jwt_rls_bridge_secret=fail reason=jwt_secret_absent");
  process.exit(1);
}

const tag = `s${randomBytes(12).toString("hex")}`;
const sql = `
create table if not exists public.atlas_jwt_rls_bridge_secret (
  id text primary key,
  secret text not null,
  source text not null default 'unknown',
  updated_at timestamptz not null default now(),
  constraint atlas_jwt_rls_bridge_secret_singleton check (id = 'default')
);
alter table public.atlas_jwt_rls_bridge_secret enable row level security;
drop policy if exists "atlas_jwt_rls_bridge_secret_deny_all" on public.atlas_jwt_rls_bridge_secret;
create policy "atlas_jwt_rls_bridge_secret_deny_all"
  on public.atlas_jwt_rls_bridge_secret
  for all to anon, authenticated
  using (false) with check (false);
insert into public.atlas_jwt_rls_bridge_secret (id, secret, source, updated_at)
values ('default', $${tag}$${secret}$${tag}$, 'management_api_ci', now())
on conflict (id) do update
  set secret = excluded.secret,
      source = excluded.source,
      updated_at = now();
`.trim();

const endpoints = [
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
];

let applied = false;
let lastError = "";
for (const endpoint of endpoints) {
  const body = endpoint.endsWith("/migrations")
    ? { name: `p3_01_sync_jwt_bridge_${Date.now()}`, query: sql }
    : { query: sql };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    applied = true;
    break;
  }
  lastError = `management_api_${res.status}:${(await res.text()).slice(0, 200)}`;
}

if (!applied) {
  console.error(`sync_jwt_rls_bridge_secret=fail reason=${lastError}`);
  process.exit(1);
}

console.log(
  `sync_jwt_rls_bridge_secret=pass secret_len=${secret.length} ref_suffix=${ref.slice(-4)}`,
);
