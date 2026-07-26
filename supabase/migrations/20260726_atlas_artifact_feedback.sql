-- Artifact user feedback (thumbs up/down) for Experience Engine / Owner analytics.
-- Upsert by (user_id, artifact_id). Deny-all RLS; API + service role enforce auth.

create table if not exists public.atlas_artifact_feedback (
  id uuid primary key,
  artifact_id text not null,
  job_id text,
  user_id text not null,
  organization_id text,
  rating_type text not null check (rating_type in ('positive', 'negative')),
  positive_reasons jsonb not null default '[]'::jsonb,
  negative_reasons jsonb not null default '[]'::jsonb,
  comment text,
  artifact_type text,
  artifact_sub_type text,
  quality_score double precision,
  model text,
  prompt_version text,
  specialist_version text,
  template_id text,
  template_version text,
  knowledge_version text,
  smart_context_version text,
  quality_engine_version text,
  regeneration_count integer,
  improvement_count integer,
  total_api_cost double precision,
  input_tokens integer,
  output_tokens integer,
  final_used boolean,
  downloaded boolean,
  shared boolean,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, artifact_id)
);

create index if not exists atlas_artifact_feedback_type_created_idx
  on public.atlas_artifact_feedback (artifact_type, created_at desc);

create index if not exists atlas_artifact_feedback_rating_idx
  on public.atlas_artifact_feedback (rating_type, created_at desc);

alter table public.atlas_artifact_feedback enable row level security;
drop policy if exists "atlas_artifact_feedback_deny_anon" on public.atlas_artifact_feedback;
create policy "atlas_artifact_feedback_deny_anon"
  on public.atlas_artifact_feedback
  for all to anon, authenticated
  using (false) with check (false);

-- Optional history of rating changes (no PII beyond user_id already stored).
create table if not exists public.atlas_artifact_feedback_history (
  id uuid primary key,
  feedback_id uuid not null references public.atlas_artifact_feedback (id) on delete cascade,
  artifact_id text not null,
  user_id text not null,
  rating_type text not null,
  positive_reasons jsonb not null default '[]'::jsonb,
  negative_reasons jsonb not null default '[]'::jsonb,
  comment text,
  changed_at timestamptz not null default now()
);

create index if not exists atlas_artifact_feedback_history_feedback_idx
  on public.atlas_artifact_feedback_history (feedback_id, changed_at desc);

alter table public.atlas_artifact_feedback_history enable row level security;
drop policy if exists "atlas_artifact_feedback_history_deny_anon"
  on public.atlas_artifact_feedback_history;
create policy "atlas_artifact_feedback_history_deny_anon"
  on public.atlas_artifact_feedback_history
  for all to anon, authenticated
  using (false) with check (false);
