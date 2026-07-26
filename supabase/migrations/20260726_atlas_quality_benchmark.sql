-- Quality Engine Phase5: Benchmark & Cost Validation
-- Durable owner benchmark + user feedback. Server writes use service role.
-- Deny-all RLS for anon/authenticated (API layer enforces owner/user auth).

-- ---------------------------------------------------------------------------
-- Standard test cases (owner-managed fixtures; no generated quality scores)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_benchmark_cases (
  id uuid primary key,
  name text not null,
  artifact_type text not null,
  request text not null default '',
  expected_sections jsonb not null default '[]'::jsonb,
  required_facts jsonb not null default '[]'::jsonb,
  prohibited_expressions jsonb not null default '[]'::jsonb,
  expected_audience text,
  expected_tone text,
  required_output_format text,
  references jsonb not null default '[]'::jsonb,
  template_id text,
  business_profile_id text,
  tags jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_benchmark_cases_type_idx
  on public.atlas_benchmark_cases (artifact_type, enabled);

alter table public.atlas_benchmark_cases enable row level security;
drop policy if exists "atlas_benchmark_cases_deny_anon" on public.atlas_benchmark_cases;
create policy "atlas_benchmark_cases_deny_anon"
  on public.atlas_benchmark_cases
  for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Benchmark runs (owner-only execution plans)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_benchmark_runs (
  id uuid primary key,
  created_by text not null,
  status text not null default 'queued',
  config jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  memo text,
  estimated_max_cost_usd double precision,
  actual_cost_usd double precision,
  case_count integer not null default 0,
  pattern_count integer not null default 0,
  result_count integer not null default 0,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists atlas_benchmark_runs_status_idx
  on public.atlas_benchmark_runs (status, created_at desc);

alter table public.atlas_benchmark_runs enable row level security;
drop policy if exists "atlas_benchmark_runs_deny_anon" on public.atlas_benchmark_runs;
create policy "atlas_benchmark_runs_deny_anon"
  on public.atlas_benchmark_runs
  for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Benchmark records / results (one row per artifact evaluation snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_benchmark_results (
  id uuid primary key,
  run_id uuid references public.atlas_benchmark_runs (id) on delete set null,
  case_id uuid references public.atlas_benchmark_cases (id) on delete set null,
  artifact_id text,
  job_id text,
  user_id text,
  organization_id text,
  artifact_type text not null,
  artifact_sub_type text,
  title text,
  model text,
  status text not null default 'completed',
  pattern_label text,
  feature_flags jsonb not null default '{}'::jsonb,
  versions jsonb not null default '{}'::jsonb,
  quality jsonb not null default '{}'::jsonb,
  processing jsonb not null default '{}'::jsonb,
  context_info jsonb not null default '{}'::jsonb,
  cost_info jsonb not null default '{}'::jsonb,
  usage_info jsonb not null default '{}'::jsonb,
  rule_evaluation jsonb,
  owner_evaluation jsonb,
  user_evaluation jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists atlas_benchmark_results_type_created_idx
  on public.atlas_benchmark_results (artifact_type, created_at desc);

create index if not exists atlas_benchmark_results_run_idx
  on public.atlas_benchmark_results (run_id);

create index if not exists atlas_benchmark_results_user_idx
  on public.atlas_benchmark_results (user_id);

create index if not exists atlas_benchmark_results_artifact_idx
  on public.atlas_benchmark_results (artifact_id);

alter table public.atlas_benchmark_results enable row level security;
drop policy if exists "atlas_benchmark_results_deny_anon" on public.atlas_benchmark_results;
create policy "atlas_benchmark_results_deny_anon"
  on public.atlas_benchmark_results
  for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Artifact quality feedback (user + owner). API enforces user can only touch own rows.
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_artifact_quality_feedback (
  id uuid primary key,
  artifact_id text not null,
  result_id uuid references public.atlas_benchmark_results (id) on delete set null,
  user_id text not null,
  role text not null default 'user',
  rating_label text,
  rating_score integer,
  reasons jsonb not null default '[]'::jsonb,
  free_text text,
  dimensions jsonb not null default '{}'::jsonb,
  usability text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_artifact_quality_feedback_user_idx
  on public.atlas_artifact_quality_feedback (user_id, created_at desc);

create index if not exists atlas_artifact_quality_feedback_artifact_idx
  on public.atlas_artifact_quality_feedback (artifact_id);

alter table public.atlas_artifact_quality_feedback enable row level security;
drop policy if exists "atlas_artifact_quality_feedback_deny_anon"
  on public.atlas_artifact_quality_feedback;
create policy "atlas_artifact_quality_feedback_deny_anon"
  on public.atlas_artifact_quality_feedback
  for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Quality thresholds (owner-configured gates; never force infinite regen)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_quality_thresholds (
  id uuid primary key,
  artifact_type text not null unique,
  min_quality_score integer not null,
  warn_only boolean not null default true,
  enabled boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_quality_thresholds enable row level security;
drop policy if exists "atlas_quality_thresholds_deny_anon" on public.atlas_quality_thresholds;
create policy "atlas_quality_thresholds_deny_anon"
  on public.atlas_quality_thresholds
  for all to anon, authenticated
  using (false) with check (false);
