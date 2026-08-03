-- Phase 3-5: WordPress Live Adapter
-- Durable WordPress external-action / idempotency evidence

create table if not exists public.atlas_wordpress_external_actions (
  id text primary key,
  owner_id text not null,
  organization_id text,
  run_id text not null,
  step_id text not null,
  action text not null,
  idempotency_key text not null,
  post_id integer not null,
  post_status text not null,
  link text not null,
  edit_link text not null,
  title_hash text not null,
  content_hash text not null,
  media_artifact_ids jsonb not null default '[]'::jsonb,
  media_ids jsonb not null default '[]'::jsonb,
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
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists atlas_wordpress_external_actions_owner_run_idx
  on public.atlas_wordpress_external_actions (owner_id, run_id);

create index if not exists atlas_wordpress_external_actions_post_idx
  on public.atlas_wordpress_external_actions (post_id);

alter table public.atlas_wordpress_external_actions enable row level security;

drop policy if exists "atlas_wordpress_external_actions_deny_anon"
  on public.atlas_wordpress_external_actions;

create policy "atlas_wordpress_external_actions_deny_anon"
  on public.atlas_wordpress_external_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
