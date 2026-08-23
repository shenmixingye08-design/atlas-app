-- Additive: idempotent usage increment for any billing meter.
-- Does not reset existing counters. Service role only.

create or replace function public.atlas_increment_usage_counter_once(
  p_user_id text,
  p_month_key text,
  p_claim_key text,
  p_meter text,
  p_amount integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  amount integer := greatest(coalesce(p_amount, 1), 1);
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
  if p_meter not in ('ai_runs', 'sns_posts', 'x_url_posts', 'wordpress_posts') then
    raise exception 'invalid meter';
  end if;

  -- Lock the counter row first so same-user increments serialize.
  -- SELECT FOR UPDATE on a missing claim_key does not take a gap lock.
  insert into public.atlas_billing_usage_counters as c (
    user_id, month_key, ai_runs, sns_posts, x_url_posts, wordpress_posts, updated_at
  ) values (
    p_user_id, p_month_key, 0, 0, 0, 0, now()
  )
  on conflict (user_id, month_key) do nothing;

  if p_meter = 'ai_runs' then
    select ai_runs into current_used
    from public.atlas_billing_usage_counters
    where user_id = p_user_id and month_key = p_month_key
    for update;
  elsif p_meter = 'sns_posts' then
    select sns_posts into current_used
    from public.atlas_billing_usage_counters
    where user_id = p_user_id and month_key = p_month_key
    for update;
  elsif p_meter = 'x_url_posts' then
    select x_url_posts into current_used
    from public.atlas_billing_usage_counters
    where user_id = p_user_id and month_key = p_month_key
    for update;
  else
    select wordpress_posts into current_used
    from public.atlas_billing_usage_counters
    where user_id = p_user_id and month_key = p_month_key
    for update;
  end if;

  current_used := coalesce(current_used, 0);

  select * into existing_claim
  from public.atlas_billing_usage_claims
  where claim_key = p_claim_key;

  if existing_claim.claim_key is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'incremented', false,
      'used', current_used,
      'meter', p_meter
    );
  end if;

  if p_meter = 'ai_runs' then
    update public.atlas_billing_usage_counters
    set ai_runs = current_used + amount, updated_at = now()
    where user_id = p_user_id and month_key = p_month_key;
  elsif p_meter = 'sns_posts' then
    update public.atlas_billing_usage_counters
    set sns_posts = current_used + amount, updated_at = now()
    where user_id = p_user_id and month_key = p_month_key;
  elsif p_meter = 'x_url_posts' then
    update public.atlas_billing_usage_counters
    set x_url_posts = current_used + amount, updated_at = now()
    where user_id = p_user_id and month_key = p_month_key;
  else
    update public.atlas_billing_usage_counters
    set wordpress_posts = current_used + amount, updated_at = now()
    where user_id = p_user_id and month_key = p_month_key;
  end if;

  begin
    insert into public.atlas_billing_usage_claims (
      claim_key, user_id, month_key, meter, amount, created_at
    ) values (
      p_claim_key, p_user_id, p_month_key, p_meter, amount, now()
    );
  exception
    when unique_violation then
      if p_meter = 'ai_runs' then
        update public.atlas_billing_usage_counters
        set ai_runs = current_used, updated_at = now()
        where user_id = p_user_id and month_key = p_month_key;
      elsif p_meter = 'sns_posts' then
        update public.atlas_billing_usage_counters
        set sns_posts = current_used, updated_at = now()
        where user_id = p_user_id and month_key = p_month_key;
      elsif p_meter = 'x_url_posts' then
        update public.atlas_billing_usage_counters
        set x_url_posts = current_used, updated_at = now()
        where user_id = p_user_id and month_key = p_month_key;
      else
        update public.atlas_billing_usage_counters
        set wordpress_posts = current_used, updated_at = now()
        where user_id = p_user_id and month_key = p_month_key;
      end if;
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'incremented', false,
        'used', current_used,
        'meter', p_meter
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'incremented', true,
    'used', current_used + amount,
    'meter', p_meter
  );
end;
$$;

revoke all on function public.atlas_increment_usage_counter_once(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.atlas_increment_usage_counter_once(text, text, text, text, integer)
  to service_role;

-- Raise ai_runs to the unique claim count without summing ledgers.
create or replace function public.atlas_sync_ai_runs_from_claims(
  p_user_id text,
  p_month_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_count integer := 0;
  current_used integer := 0;
  next_used integer := 0;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'user_id required';
  end if;
  if p_month_key is null or length(trim(p_month_key)) = 0 then
    raise exception 'month_key required';
  end if;

  select count(*)::integer into claim_count
  from public.atlas_billing_usage_claims
  where user_id = p_user_id
    and month_key = p_month_key
    and meter = 'ai_runs';

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
  next_used := greatest(current_used, coalesce(claim_count, 0));

  if next_used > current_used then
    update public.atlas_billing_usage_counters
    set ai_runs = next_used, updated_at = now()
    where user_id = p_user_id and month_key = p_month_key;
  end if;

  return jsonb_build_object(
    'ok', true,
    'used', next_used,
    'claimCount', coalesce(claim_count, 0)
  );
end;
$$;

revoke all on function public.atlas_sync_ai_runs_from_claims(text, text)
  from public, anon, authenticated;
grant execute on function public.atlas_sync_ai_runs_from_claims(text, text)
  to service_role;
