-- Stage 3/4: Supabase Storage-backed deliverable binaries + integrity metadata.
-- Extends atlas_deliverable_files without dropping legacy content_base64.

alter table public.atlas_deliverable_files
  add column if not exists content_sha256 text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists storage_status text not null default 'pending',
  add column if not exists storage_error text,
  add column if not exists has_pk_header boolean,
  add column if not exists ooxml_verified boolean,
  add column if not exists download_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deliverable_metadata jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists atlas_deliverable_files_storage_path_idx
  on public.atlas_deliverable_files (storage_bucket, storage_path)
  where storage_path is not null;

create index if not exists atlas_deliverable_files_sha256_idx
  on public.atlas_deliverable_files (content_sha256)
  where content_sha256 is not null;

-- Job stage persistence for resumable Word pipeline.
create table if not exists public.atlas_deliverable_jobs (
  id text primary key,
  user_id text not null,
  format text not null default 'docx',
  stage text not null,
  status text not null default 'running',
  assignment text not null default '',
  source_content text not null default '',
  base_file_name text not null default 'document',
  deliverable_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  last_error_stage text,
  last_error_message text,
  notification_id text,
  notification_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_deliverable_jobs_user_updated_idx
  on public.atlas_deliverable_jobs (user_id, updated_at desc);

create index if not exists atlas_deliverable_jobs_status_lease_idx
  on public.atlas_deliverable_jobs (status, lease_expires_at);

alter table public.atlas_deliverable_jobs enable row level security;

drop policy if exists "atlas_deliverable_jobs_deny_anon"
  on public.atlas_deliverable_jobs;
create policy "atlas_deliverable_jobs_deny_anon"
  on public.atlas_deliverable_jobs
  for all to anon, authenticated
  using (false) with check (false);

-- Version groups (each version = unique deliverable id).
create table if not exists public.atlas_deliverable_versions (
  group_id text not null,
  deliverable_id uuid not null,
  parent_deliverable_id uuid,
  version integer not null,
  is_latest boolean not null default false,
  revision_reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  job_id text,
  display_name text not null,
  internal_file_name text not null,
  diff_summary text,
  primary key (group_id, version)
);

create index if not exists atlas_deliverable_versions_deliverable_idx
  on public.atlas_deliverable_versions (deliverable_id);

alter table public.atlas_deliverable_versions enable row level security;
drop policy if exists "atlas_deliverable_versions_deny_anon"
  on public.atlas_deliverable_versions;
create policy "atlas_deliverable_versions_deny_anon"
  on public.atlas_deliverable_versions
  for all to anon, authenticated
  using (false) with check (false);

-- Per-user Word company / brand settings.
create table if not exists public.atlas_word_company_brand (
  user_id text primary key,
  company_name text,
  department_name text,
  contact_name text,
  postal_code text,
  address text,
  phone text,
  email text,
  website text,
  logo_data_url text,
  brand_color_hex text,
  footer_text text,
  default_font text,
  default_template_id text,
  updated_at timestamptz not null default now()
);

alter table public.atlas_word_company_brand enable row level security;
drop policy if exists "atlas_word_company_brand_deny_anon"
  on public.atlas_word_company_brand;
create policy "atlas_word_company_brand_deny_anon"
  on public.atlas_word_company_brand
  for all to anon, authenticated
  using (false) with check (false);
