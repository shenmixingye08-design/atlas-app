-- Phase 2: Document engine — persisted IR + deliverable artifact metadata.
-- Apply before enabling durable document storage in production.
-- Rollback: drop tables in reverse order (deliverable_artifacts, document_models).

create table if not exists public.document_models (
  id uuid primary key,
  user_id text,
  job_id uuid references public.atlas_automation_jobs(id) on delete set null,
  schema_version integer not null default 1,
  document_type text not null,
  template_id text not null,
  title text not null,
  model jsonb not null,
  language text not null default 'ja',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_models_user_idx
  on public.document_models (user_id, created_at desc);

create index if not exists document_models_job_idx
  on public.document_models (job_id);

create table if not exists public.deliverable_artifacts (
  id uuid primary key,
  document_model_id uuid not null references public.document_models(id) on delete cascade,
  user_id text,
  job_id uuid references public.atlas_automation_jobs(id) on delete set null,
  format text not null,
  template_id text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  page_count integer,
  sheet_count integer,
  storage_path text,
  signed_url_expires_at timestamptz,
  validation_passed boolean not null default false,
  validation_error text,
  created_at timestamptz not null default now()
);

create index if not exists deliverable_artifacts_model_idx
  on public.deliverable_artifacts (document_model_id);

create index if not exists deliverable_artifacts_user_idx
  on public.deliverable_artifacts (user_id, created_at desc);

alter table public.document_models enable row level security;
alter table public.deliverable_artifacts enable row level security;

drop policy if exists "document_models_deny_anon" on public.document_models;
create policy "document_models_deny_anon"
  on public.document_models for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "deliverable_artifacts_deny_anon" on public.deliverable_artifacts;
create policy "deliverable_artifacts_deny_anon"
  on public.deliverable_artifacts for all to anon, authenticated
  using (false) with check (false);
