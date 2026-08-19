-- P4: atomic work-job create identity (multi-instance).
-- Source of truth is this table, not process memory and not SELECT-then-INSERT.
-- Same (user_id, idempotency_key) can exist once.

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

create index if not exists atlas_work_jobs_user_created_idx
  on public.atlas_work_jobs (user_id, created_at desc);

alter table public.atlas_work_jobs enable row level security;

drop policy if exists "atlas_work_jobs_deny_anon" on public.atlas_work_jobs;

create policy "atlas_work_jobs_deny_anon"
  on public.atlas_work_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);

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
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'atlas_claim_work_job: user_id required';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'atlas_claim_work_job: idempotency_key required';
  end if;

  insert into public.atlas_work_jobs (
    id,
    user_id,
    idempotency_key,
    assignment,
    metadata,
    status,
    attempt_count,
    max_attempts
  ) values (
    p_id,
    p_user_id,
    p_idempotency_key,
    coalesce(p_assignment, ''),
    coalesce(p_metadata, '{}'::jsonb),
    'queued',
    0,
    greatest(coalesce(p_max_attempts, 3), 1)
  )
  on conflict (user_id, idempotency_key) do nothing
  returning * into created;

  if created.id is not null then
    return jsonb_build_object(
      'action', 'created',
      'id', created.id,
      'user_id', created.user_id,
      'idempotency_key', created.idempotency_key,
      'assignment', created.assignment,
      'metadata', created.metadata,
      'status', created.status,
      'attempt_count', created.attempt_count,
      'max_attempts', created.max_attempts,
      'error', created.error,
      'created_at', created.created_at,
      'updated_at', created.updated_at,
      'completed_at', created.completed_at
    );
  end if;

  select * into existing
  from public.atlas_work_jobs
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key;

  if existing.id is null then
    raise exception 'atlas_claim_work_job: unique conflict without existing row';
  end if;

  return jsonb_build_object(
    'action', 'reused',
    'id', existing.id,
    'user_id', existing.user_id,
    'idempotency_key', existing.idempotency_key,
    'assignment', existing.assignment,
    'metadata', existing.metadata,
    'status', existing.status,
    'attempt_count', existing.attempt_count,
    'max_attempts', existing.max_attempts,
    'error', existing.error,
    'created_at', existing.created_at,
    'updated_at', existing.updated_at,
    'completed_at', existing.completed_at
  );
end;
$$;

revoke all on function public.atlas_claim_work_job(uuid, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.atlas_claim_work_job(uuid, text, text, text, jsonb, integer) to service_role;
