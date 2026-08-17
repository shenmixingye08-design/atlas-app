-- P0: per-user monthly usage counters (DB SoT).
-- Replaces process-memory / global blob as the quota source of truth.
-- SAFE: additive. Service role writes; anon/authenticated denied via RLS.

create table if not exists public.atlas_billing_usage_counters (
  user_id text not null,
  month_key text not null,
  ai_runs integer not null default 0,
  sns_posts integer not null default 0,
  x_url_posts integer not null default 0,
  wordpress_posts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key),
  constraint atlas_billing_usage_counters_ai_runs_check check (ai_runs >= 0),
  constraint atlas_billing_usage_counters_sns_posts_check check (sns_posts >= 0)
);

create table if not exists public.atlas_billing_usage_claims (
  claim_key text primary key,
  user_id text not null,
  month_key text not null,
  meter text not null,
  amount integer not null default 1,
  created_at timestamptz not null default now(),
  constraint atlas_billing_usage_claims_amount_check check (amount > 0)
);

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

-- Atomic reserve: same claim_key is idempotent. Never exceeds p_limit.
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
