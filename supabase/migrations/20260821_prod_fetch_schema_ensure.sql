-- Production fetch hotfix (GET /api/billing/summary + GET /api/automations).
-- Additive / idempotent only. Safe to re-run.
-- Does NOT drop tables, wipe rows, or reset counters/subscriptions/automations.

-- ---------------------------------------------------------------------------
-- P0 usage meters (also declared in 20260817_p0_billing_usage_counters.sql)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_billing_usage_counters (
  user_id text not null,
  month_key text not null,
  ai_runs integer not null default 0,
  sns_posts integer not null default 0,
  x_url_posts integer not null default 0,
  wordpress_posts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key)
);

alter table public.atlas_billing_usage_counters
  add column if not exists ai_runs integer not null default 0;
alter table public.atlas_billing_usage_counters
  add column if not exists sns_posts integer not null default 0;
alter table public.atlas_billing_usage_counters
  add column if not exists x_url_posts integer not null default 0;
alter table public.atlas_billing_usage_counters
  add column if not exists wordpress_posts integer not null default 0;
alter table public.atlas_billing_usage_counters
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.atlas_billing_usage_claims (
  claim_key text primary key,
  user_id text not null,
  month_key text not null,
  meter text not null,
  amount integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.atlas_billing_usage_claims
  add column if not exists user_id text;
alter table public.atlas_billing_usage_claims
  add column if not exists month_key text;
alter table public.atlas_billing_usage_claims
  add column if not exists meter text;
alter table public.atlas_billing_usage_claims
  add column if not exists amount integer not null default 1;
alter table public.atlas_billing_usage_claims
  add column if not exists created_at timestamptz not null default now();

create index if not exists atlas_billing_usage_claims_user_month_idx
  on public.atlas_billing_usage_claims (user_id, month_key);

alter table public.atlas_billing_usage_counters enable row level security;
alter table public.atlas_billing_usage_claims enable row level security;

drop policy if exists "atlas_billing_usage_counters_deny_anon"
  on public.atlas_billing_usage_counters;
create policy "atlas_billing_usage_counters_deny_anon"
  on public.atlas_billing_usage_counters
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_billing_usage_claims_deny_anon"
  on public.atlas_billing_usage_claims;
create policy "atlas_billing_usage_claims_deny_anon"
  on public.atlas_billing_usage_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.atlas_billing_usage_counters from anon, authenticated;
revoke all on public.atlas_billing_usage_claims from anon, authenticated;
grant all on public.atlas_billing_usage_counters to service_role;
grant all on public.atlas_billing_usage_claims to service_role;

create or replace function public.atlas_reserve_ai_run(
  p_user_id text,
  p_month_key text,
  p_claim_key text,
  p_limit integer,
  p_amount integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  amount integer := greatest(coalesce(p_amount, 1), 1);
  hard_limit integer := greatest(coalesce(p_limit, 0), 0);
  current_used integer := 0;
  existing_claim public.atlas_billing_usage_claims%rowtype;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'user_id required';
  end if;
  if p_month_key is null or length(trim(p_month_key)) = 0 then
    raise exception 'month_key required';
  end if;
  if p_claim_key is null or length(trim(p_claim_key)) = 0 then
    raise exception 'claim_key required';
  end if;

  select * into existing_claim
  from public.atlas_billing_usage_claims
  where claim_key = p_claim_key
  for update;

  if found then
    select ai_runs into current_used
    from public.atlas_billing_usage_counters
    where user_id = p_user_id and month_key = p_month_key;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'used', coalesce(current_used, 0),
      'limit', hard_limit
    );
  end if;

  insert into public.atlas_billing_usage_counters as c (
    user_id, month_key, ai_runs, updated_at
  ) values (
    p_user_id, p_month_key, 0, now()
  )
  on conflict (user_id, month_key) do nothing;

  select ai_runs into current_used
  from public.atlas_billing_usage_counters
  where user_id = p_user_id and month_key = p_month_key
  for update;

  current_used := coalesce(current_used, 0);
  if current_used + amount > hard_limit then
    return jsonb_build_object(
      'ok', false,
      'idempotent', false,
      'used', current_used,
      'limit', hard_limit,
      'reason', 'limit_reached'
    );
  end if;

  update public.atlas_billing_usage_counters
  set ai_runs = current_used + amount,
      updated_at = now()
  where user_id = p_user_id and month_key = p_month_key;

  insert into public.atlas_billing_usage_claims (
    claim_key, user_id, month_key, meter, amount, created_at
  ) values (
    p_claim_key, p_user_id, p_month_key, 'ai_runs', amount, now()
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'used', current_used + amount,
    'limit', hard_limit
  );
end;
$$;

revoke all on function public.atlas_reserve_ai_run(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.atlas_reserve_ai_run(text, text, text, integer, integer) to service_role;

create table if not exists public.atlas_billing_automation_slots (
  user_id text not null,
  slot_index integer not null,
  automation_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slot_index),
  unique (automation_id)
);

alter table public.atlas_billing_automation_slots
  add column if not exists user_id text;
alter table public.atlas_billing_automation_slots
  add column if not exists slot_index integer;
alter table public.atlas_billing_automation_slots
  add column if not exists automation_id text;
alter table public.atlas_billing_automation_slots
  add column if not exists created_at timestamptz not null default now();

alter table public.atlas_billing_automation_slots enable row level security;

revoke all on public.atlas_billing_automation_slots from anon, authenticated;
grant all on public.atlas_billing_automation_slots to service_role;

create or replace function public.atlas_reserve_automation_slot(
  p_user_id text,
  p_automation_id text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hard_limit integer := greatest(coalesce(p_limit, 0), 0);
  n integer := 0;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'user_id required';
  end if;
  if p_automation_id is null or length(trim(p_automation_id)) = 0 then
    raise exception 'automation_id required';
  end if;

  if exists (
    select 1
    from public.atlas_billing_automation_slots
    where automation_id = p_automation_id
  ) then
    select count(*)::integer into n
    from public.atlas_billing_automation_slots
    where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'idempotent', true, 'used', n, 'limit', hard_limit);
  end if;

  loop
    select count(*)::integer into n
    from public.atlas_billing_automation_slots
    where user_id = p_user_id;

    if n >= hard_limit then
      return jsonb_build_object(
        'ok', false,
        'idempotent', false,
        'used', n,
        'limit', hard_limit,
        'reason', 'limit_reached'
      );
    end if;

    begin
      insert into public.atlas_billing_automation_slots (
        user_id,
        slot_index,
        automation_id
      )
      values (p_user_id, n + 1, p_automation_id);
      return jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'used', n + 1,
        'limit', hard_limit
      );
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

create or replace function public.atlas_release_automation_slot(
  p_automation_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.atlas_billing_automation_slots
  where automation_id = p_automation_id;
end;
$$;

revoke all on function public.atlas_reserve_automation_slot(text, text, integer) from public, anon, authenticated;
revoke all on function public.atlas_release_automation_slot(text) from public, anon, authenticated;
grant execute on function public.atlas_reserve_automation_slot(text, text, integer) to service_role;
grant execute on function public.atlas_release_automation_slot(text) to service_role;

-- ---------------------------------------------------------------------------
-- P0-6 V1 automation definitions (also declared in 20260805)
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_automation_definitions (
  id text primary key,
  owner_user_id text not null,
  organization_id text,
  title text not null default '',
  status text not null default 'idle',
  enabled boolean not null default true,
  paused boolean not null default false,
  schedule_kind text not null default 'schedule',
  schedule_cron text,
  schedule_timezone text,
  schedule_label text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  definition jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.atlas_automation_definitions
  add column if not exists owner_user_id text;
alter table public.atlas_automation_definitions
  add column if not exists organization_id text;
alter table public.atlas_automation_definitions
  add column if not exists title text;
alter table public.atlas_automation_definitions
  add column if not exists status text;
alter table public.atlas_automation_definitions
  add column if not exists enabled boolean not null default true;
alter table public.atlas_automation_definitions
  add column if not exists paused boolean not null default false;
alter table public.atlas_automation_definitions
  add column if not exists schedule_kind text not null default 'schedule';
alter table public.atlas_automation_definitions
  add column if not exists schedule_cron text;
alter table public.atlas_automation_definitions
  add column if not exists schedule_timezone text;
alter table public.atlas_automation_definitions
  add column if not exists schedule_label text;
alter table public.atlas_automation_definitions
  add column if not exists next_run_at timestamptz;
alter table public.atlas_automation_definitions
  add column if not exists last_run_at timestamptz;
alter table public.atlas_automation_definitions
  add column if not exists retry_count integer not null default 0;
alter table public.atlas_automation_definitions
  add column if not exists max_retries integer not null default 3;
alter table public.atlas_automation_definitions
  add column if not exists next_retry_at timestamptz;
alter table public.atlas_automation_definitions
  add column if not exists last_error_code text;
alter table public.atlas_automation_definitions
  add column if not exists last_error_message text;
alter table public.atlas_automation_definitions
  add column if not exists definition jsonb not null default '{}'::jsonb;
alter table public.atlas_automation_definitions
  add column if not exists version integer not null default 1;
alter table public.atlas_automation_definitions
  add column if not exists created_at timestamptz not null default now();
alter table public.atlas_automation_definitions
  add column if not exists updated_at timestamptz not null default now();
alter table public.atlas_automation_definitions
  add column if not exists deleted_at timestamptz;

create index if not exists atlas_automation_definitions_owner_idx
  on public.atlas_automation_definitions (owner_user_id)
  where deleted_at is null;

create index if not exists atlas_automation_definitions_owner_enabled_idx
  on public.atlas_automation_definitions (owner_user_id, enabled)
  where deleted_at is null;

create table if not exists public.atlas_automation_executions (
  id text primary key,
  automation_id text not null,
  owner_user_id text not null,
  organization_id text,
  status text not null default 'queued',
  trigger_type text not null default 'automation',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  work_queue_job_id text,
  workflow_run_id text,
  idempotency_key text,
  occurrence_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_automation_executions
  add column if not exists automation_id text;
alter table public.atlas_automation_executions
  add column if not exists owner_user_id text;
alter table public.atlas_automation_executions
  add column if not exists deleted_at timestamptz;
alter table public.atlas_automation_executions
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.atlas_automation_executions
  add column if not exists idempotency_key text;
alter table public.atlas_automation_executions
  add column if not exists occurrence_key text;

alter table public.atlas_automation_definitions enable row level security;
alter table public.atlas_automation_executions enable row level security;

drop policy if exists "atlas_automation_definitions_deny_anon"
  on public.atlas_automation_definitions;
create policy "atlas_automation_definitions_deny_anon"
  on public.atlas_automation_definitions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_automation_executions_deny_anon"
  on public.atlas_automation_executions;
create policy "atlas_automation_executions_deny_anon"
  on public.atlas_automation_executions
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.atlas_automation_definitions from anon, authenticated;
revoke all on public.atlas_automation_executions from anon, authenticated;
grant all on public.atlas_automation_definitions to service_role;
grant all on public.atlas_automation_executions to service_role;

-- Refresh PostgREST schema cache so new tables/columns are visible immediately.
notify pgrst, 'reload schema';
