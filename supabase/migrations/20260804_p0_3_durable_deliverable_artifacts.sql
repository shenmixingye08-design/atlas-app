-- P0-3: Harden atlas_deliverable_files for Durable Artifact Contract.
-- Idempotent. Rollback: drop added columns/constraints (table data kept).
-- Apply after 20260726 / 20260727. Partial apply safe via IF NOT EXISTS.
-- Existing rows: new columns nullable; no forced backfill.
-- Production without migration: persist fail-closes (no local disk SoT).

alter table public.atlas_deliverable_files
  add column if not exists organization_id text;

alter table public.atlas_deliverable_files
  add column if not exists run_id text;

alter table public.atlas_deliverable_files
  add column if not exists job_id text;

alter table public.atlas_deliverable_files
  add column if not exists step_id text;

alter table public.atlas_deliverable_files
  add column if not exists verified_at timestamptz;

alter table public.atlas_deliverable_files
  add column if not exists stored_at timestamptz;

alter table public.atlas_deliverable_files
  add column if not exists diagnostic_id text;

alter table public.atlas_deliverable_files
  add column if not exists context_version text;

alter table public.atlas_deliverable_files
  add column if not exists completion_evidence_id text;

alter table public.atlas_deliverable_files
  add column if not exists orphan_cleanup_status text;

-- Status validation (covers legacy + P0-3)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_deliverable_files_storage_status_check'
  ) then
    alter table public.atlas_deliverable_files
      add constraint atlas_deliverable_files_storage_status_check
      check (storage_status in (
        'pending',
        'stored',
        'failed',
        'regenerated',
        'missing',
        'legacy_base64',
        'orphan_storage',
        'verified',
        'deleted'
      ));
  end if;
end $$;

-- owner required (user_id already NOT NULL in base migration — re-assert)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_deliverable_files'
      and column_name = 'user_id'
      and is_nullable = 'YES'
  ) then
    alter table public.atlas_deliverable_files
      alter column user_id set not null;
  end if;
end $$;

-- byteSize non-negative when present
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_deliverable_files_size_nonneg'
  ) then
    alter table public.atlas_deliverable_files
      add constraint atlas_deliverable_files_size_nonneg
      check (size_bytes is null or size_bytes >= 0);
  end if;
end $$;

-- Unique storage path when present (duplicate prevention)
create unique index if not exists atlas_deliverable_files_storage_path_uidx
  on public.atlas_deliverable_files (storage_bucket, storage_path)
  where storage_path is not null and deleted_at is null;

create index if not exists atlas_deliverable_files_owner_status_idx
  on public.atlas_deliverable_files (user_id, storage_status);

create index if not exists atlas_deliverable_files_job_idx
  on public.atlas_deliverable_files (job_id)
  where job_id is not null;

create index if not exists atlas_deliverable_files_org_idx
  on public.atlas_deliverable_files (organization_id)
  where organization_id is not null;

comment on column public.atlas_deliverable_files.content_sha256 is
  'P0-3 checksum (sha256 hex). Required for verified/completed artifacts.';
comment on column public.atlas_deliverable_files.verified_at is
  'Set after Storage re-fetch size+checksum match.';
comment on column public.atlas_deliverable_files.completion_evidence_id is
  'Links Job completion evidence to this artifact.';
