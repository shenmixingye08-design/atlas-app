-- P1-04: Durable side-effect idempotency claims (Production DB SoT).
-- Prevents duplicate external side effects across retry / reclaim / multi-instance.
-- SAFE: additive only. Service role writes; anon/authenticated denied via RLS.

create table if not exists public.atlas_side_effect_claims (
  id text primary key,
  user_id text not null,
  idempotency_key text not null,
  provider text not null,
  action_type text not null,
  automation_id text,
  run_id text,
  occurrence_key text,
  destination_fingerprint text not null default '',
  status text not null default 'pending',
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  provider_resource_id text,
  provider_request_id text,
  evidence jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint atlas_side_effect_claims_status_check check (status in (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'unknown_outcome'
  )),
  constraint atlas_side_effect_claims_attempt_check
    check (attempt_count >= 0 and max_attempts >= 0)
);

create unique index if not exists atlas_side_effect_claims_user_key_uidx
  on public.atlas_side_effect_claims (user_id, idempotency_key);

create unique index if not exists atlas_side_effect_claims_provider_resource_uidx
  on public.atlas_side_effect_claims (provider, provider_resource_id)
  where provider_resource_id is not null;

create index if not exists atlas_side_effect_claims_user_status_idx
  on public.atlas_side_effect_claims (user_id, status, updated_at desc);

create index if not exists atlas_side_effect_claims_lease_idx
  on public.atlas_side_effect_claims (status, lease_expires_at)
  where status = 'processing';

alter table public.atlas_side_effect_claims enable row level security;

drop policy if exists "atlas_side_effect_claims_deny_anon"
  on public.atlas_side_effect_claims;
create policy "atlas_side_effect_claims_deny_anon"
  on public.atlas_side_effect_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Atomic claim: pending/failed/stale-processing → processing (single winner).
-- Stale processing WITHOUT provider_resource_id is NOT reclaimable for re-execution
-- (crash-after-success): those rows are flipped to unknown_outcome instead.
create or replace function public.atlas_claim_side_effect(
  p_id text,
  p_user_id text,
  p_lease_owner text,
  p_lease_ms integer default 60000
)
returns public.atlas_side_effect_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.atlas_side_effect_claims;
  now_ts timestamptz := now();
  lease_ts timestamptz := now() + make_interval(secs => greatest(p_lease_ms, 1000) / 1000.0);
begin
  select * into row
  from public.atlas_side_effect_claims
  where id = p_id and user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  if row.status = 'succeeded' or row.status = 'unknown_outcome' then
    return row;
  end if;

  if row.status = 'processing'
     and row.lease_expires_at is not null
     and row.lease_expires_at > now_ts then
    return row; -- other winner still holds lease
  end if;

  -- Stale processing without evidence → fail-closed (do not re-execute).
  if row.status = 'processing'
     and (row.lease_expires_at is null or row.lease_expires_at <= now_ts)
     and row.provider_resource_id is null then
    update public.atlas_side_effect_claims
    set status = 'unknown_outcome',
        lease_owner = null,
        lease_expires_at = null,
        last_error_code = 'crash_after_success_ambiguous',
        last_error_message = 'stale processing without provider resource id',
        completed_at = now_ts,
        updated_at = now_ts
    where id = p_id and user_id = p_user_id
    returning * into row;
    return row;
  end if;

  if row.status in ('pending', 'failed')
     or (
       row.status = 'processing'
       and (row.lease_expires_at is null or row.lease_expires_at <= now_ts)
       and row.provider_resource_id is not null
     ) then
    update public.atlas_side_effect_claims
    set status = 'processing',
        lease_owner = p_lease_owner,
        lease_expires_at = lease_ts,
        attempt_count = row.attempt_count + 1,
        updated_at = now_ts,
        last_error_code = null,
        last_error_message = null
    where id = p_id
      and user_id = p_user_id
      and status = row.status
    returning * into row;
    return row;
  end if;

  return row;
end;
$$;

revoke all on function public.atlas_claim_side_effect(text, text, text, integer) from public;
grant execute on function public.atlas_claim_side_effect(text, text, text, integer) to service_role;
