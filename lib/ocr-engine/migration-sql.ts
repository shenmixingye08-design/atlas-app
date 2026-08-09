/**
 * Inline SQL for Production serverless apply (P2-05).
 * Keep in sync with supabase/migrations/20260809_p2_05_ocr_engine_evaluations.sql.
 */
export const ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL = `
create table if not exists public.atlas_ocr_engine_evaluations (
  id text primary key,
  correlation_id text not null,
  at timestamptz not null default now(),
  user_id text not null,
  engine_id text not null,
  dedicated_engine_required boolean not null default false,
  accuracy double precision not null default 0,
  tokens_expected jsonb not null default '[]'::jsonb,
  tokens_hit jsonb not null default '[]'::jsonb,
  extracted_text_preview text,
  confidence double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.atlas_ocr_engine_evaluations add column if not exists correlation_id text;
alter table public.atlas_ocr_engine_evaluations add column if not exists at timestamptz;
alter table public.atlas_ocr_engine_evaluations add column if not exists user_id text;
alter table public.atlas_ocr_engine_evaluations add column if not exists engine_id text;
alter table public.atlas_ocr_engine_evaluations add column if not exists dedicated_engine_required boolean;
alter table public.atlas_ocr_engine_evaluations add column if not exists accuracy double precision;
alter table public.atlas_ocr_engine_evaluations add column if not exists tokens_expected jsonb;
alter table public.atlas_ocr_engine_evaluations add column if not exists tokens_hit jsonb;
alter table public.atlas_ocr_engine_evaluations add column if not exists extracted_text_preview text;
alter table public.atlas_ocr_engine_evaluations add column if not exists confidence double precision;
alter table public.atlas_ocr_engine_evaluations add column if not exists metadata jsonb;
alter table public.atlas_ocr_engine_evaluations add column if not exists created_at timestamptz;

alter table public.atlas_ocr_engine_evaluations alter column metadata set default '{}'::jsonb;
update public.atlas_ocr_engine_evaluations set metadata = '{}'::jsonb where metadata is null;
alter table public.atlas_ocr_engine_evaluations alter column metadata set not null;

create index if not exists atlas_ocr_engine_eval_corr_idx
  on public.atlas_ocr_engine_evaluations (correlation_id, created_at desc);
create index if not exists atlas_ocr_engine_eval_user_idx
  on public.atlas_ocr_engine_evaluations (user_id, created_at desc);
create index if not exists atlas_ocr_engine_eval_created_idx
  on public.atlas_ocr_engine_evaluations (created_at desc);

alter table public.atlas_ocr_engine_evaluations enable row level security;
drop policy if exists "atlas_ocr_engine_evaluations_deny_anon" on public.atlas_ocr_engine_evaluations;
create policy "atlas_ocr_engine_evaluations_deny_anon"
  on public.atlas_ocr_engine_evaluations
  for all to anon, authenticated
  using (false) with check (false);
`.trim();
