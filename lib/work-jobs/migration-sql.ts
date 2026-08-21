/**
 * Inline SQL for work-job create identity.
 * Mirrors supabase/migrations/20260819_p4_work_job_idempotency.sql
 */

export const ATLAS_WORK_JOB_IDEMPOTENCY_MIGRATION_SQL = `
create table if not exists public.atlas_work_jobs (
  id uuid primary key,
  user_id text not null,
  idempotency_key text not null,
  assignment text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create or replace function public.atlas_claim_work_job(
  p_id uuid,
  p_user_id text,
  p_idempotency_key text,
  p_assignment text,
  p_metadata jsonb,
  p_max_attempts integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.atlas_work_jobs;
  existing public.atlas_work_jobs;
begin
  insert into public.atlas_work_jobs (
    id, user_id, idempotency_key, assignment, metadata, status, attempt_count, max_attempts
  ) values (
    p_id, p_user_id, p_idempotency_key, coalesce(p_assignment, ''),
    coalesce(p_metadata, '{}'::jsonb), 'queued', 0, greatest(coalesce(p_max_attempts, 3), 1)
  )
  on conflict (user_id, idempotency_key) do nothing
  returning * into created;

  if created.id is not null then
    return jsonb_build_object('action', 'created', 'id', created.id);
  end if;

  select * into existing
  from public.atlas_work_jobs
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if existing.id is null then
    raise exception 'atlas_claim_work_job: unique conflict without existing row';
  end if;

  return jsonb_build_object('action', 'reused', 'id', existing.id);
end;
$$;
`;
