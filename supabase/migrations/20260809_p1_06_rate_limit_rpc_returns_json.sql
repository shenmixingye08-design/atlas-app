-- P1-06 follow-up #2: atlas_consume_rate_limit returns json (PostgREST-stable).
-- Prior TABLE-return shape still failed consumeRpcOk on Production probe.
-- SAFE: recreates function only. Counter table data preserved.

drop function if exists public.atlas_consume_rate_limit(text, text, integer, integer, integer);

create or replace function public.atlas_consume_rate_limit(
  p_bucket text,
  p_subject_key text,
  p_max integer,
  p_window_ms integer,
  p_min_interval_ms integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  now_ms bigint := (extract(epoch from now_ts) * 1000)::bigint;
  v_window_ms integer := greatest(p_window_ms, 1);
  max_hits integer := greatest(p_max, 0);
  min_interval integer := greatest(coalesce(p_min_interval_ms, 0), 0);
  window_start_ms bigint;
  v_window_started_at timestamptz;
  row_id text;
  v_current_count integer := 0;
  last_hit timestamptz;
  v_retry_ms integer := 0;
  elapsed_ms bigint;
begin
  if p_bucket is null or length(trim(p_bucket)) = 0 then
    raise exception 'bucket required';
  end if;
  if p_subject_key is null or length(trim(p_subject_key)) = 0 then
    raise exception 'subject_key required';
  end if;

  window_start_ms := (now_ms / v_window_ms) * v_window_ms;
  v_window_started_at := to_timestamp(window_start_ms / 1000.0);
  row_id := p_bucket || ':' || p_subject_key || ':' || window_start_ms::text;

  insert into public.atlas_rate_limit_counters as c (
    id, bucket, subject_key, window_started_at, window_ms, hit_count, last_hit_at, created_at, updated_at
  ) values (
    row_id, p_bucket, p_subject_key, v_window_started_at, v_window_ms, 0, now_ts, now_ts, now_ts
  )
  on conflict (id) do nothing;

  select c.hit_count, c.last_hit_at
    into v_current_count, last_hit
  from public.atlas_rate_limit_counters c
  where c.id = row_id
  for update;

  if last_hit is not null and min_interval > 0 then
    elapsed_ms := (extract(epoch from (now_ts - last_hit)) * 1000)::bigint;
    if elapsed_ms < min_interval then
      v_retry_ms := greatest((min_interval - elapsed_ms)::integer, 1);
      return json_build_object(
        'allowed', false,
        'remaining', greatest(max_hits - v_current_count, 0),
        'retry_after_ms', v_retry_ms,
        'hit_count', v_current_count,
        'window_started_at', v_window_started_at
      );
    end if;
  end if;

  if v_current_count >= max_hits then
    v_retry_ms := greatest(((window_start_ms + v_window_ms) - now_ms)::integer, 1);
    return json_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_ms', v_retry_ms,
      'hit_count', v_current_count,
      'window_started_at', v_window_started_at
    );
  end if;

  update public.atlas_rate_limit_counters
  set hit_count = atlas_rate_limit_counters.hit_count + 1,
      last_hit_at = now_ts,
      updated_at = now_ts,
      window_ms = v_window_ms
  where id = row_id
  returning atlas_rate_limit_counters.hit_count into v_current_count;

  return json_build_object(
    'allowed', true,
    'remaining', greatest(max_hits - v_current_count, 0),
    'retry_after_ms', 0,
    'hit_count', v_current_count,
    'window_started_at', v_window_started_at
  );
end;
$$;

revoke all on function public.atlas_consume_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.atlas_consume_rate_limit(text, text, integer, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
