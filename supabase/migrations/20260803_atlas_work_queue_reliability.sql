-- Work-queue reliability hardening:
-- persistent meta (scheduler health / delay rings), side-effect idempotency, retry history.
-- Apply after 20260802_atlas_work_queue.sql.

alter table public.atlas_work_queue_jobs
  add column if not exists retry_history jsonb not null default '[]'::jsonb;

create table if not exists public.atlas_work_queue_meta (
  meta_key text primary key,
  meta_value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_work_queue_side_effects (
  idempotency_key text primary key,
  job_id uuid not null references public.atlas_work_queue_jobs(job_id) on delete cascade,
  run_id text not null,
  step_id text not null,
  kind text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_work_queue_side_effects_job_idx
  on public.atlas_work_queue_side_effects (job_id, step_id);

alter table public.atlas_work_queue_meta enable row level security;
alter table public.atlas_work_queue_side_effects enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "atlas_work_queue_meta_deny" on public.atlas_work_queue_meta;
    create policy "atlas_work_queue_meta_deny"
      on public.atlas_work_queue_meta for all to anon, authenticated
      using (false) with check (false);

    drop policy if exists "atlas_work_queue_side_effects_deny" on public.atlas_work_queue_side_effects;
    create policy "atlas_work_queue_side_effects_deny"
      on public.atlas_work_queue_side_effects for all to anon, authenticated
      using (false) with check (false);
  end if;
end $$;
