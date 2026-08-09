/** Inline SQL for Production apply / health probe (mirrors supabase migration). */
export const ATLAS_DISTRIBUTED_RATE_LIMIT_MIGRATION_SQL = `
-- P1-06: Distributed rate limit counters (Production DB SoT).
create table if not exists public.atlas_rate_limit_counters (
  id text primary key,
  bucket text not null,
  subject_key text not null,
  window_started_at timestamptz not null,
  window_ms integer not null,
  hit_count integer not null default 0,
  last_hit_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_rate_limit_counters_hit_check check (hit_count >= 0),
  constraint atlas_rate_limit_counters_window_check check (window_ms > 0)
);

create unique index if not exists atlas_rate_limit_counters_bucket_subject_window_uidx
  on public.atlas_rate_limit_counters (bucket, subject_key, window_started_at);

create index if not exists atlas_rate_limit_counters_bucket_subject_idx
  on public.atlas_rate_limit_counters (bucket, subject_key, updated_at desc);

alter table public.atlas_rate_limit_counters enable row level security;

drop policy if exists "atlas_rate_limit_counters_deny_anon"
  on public.atlas_rate_limit_counters;
create policy "atlas_rate_limit_counters_deny_anon"
  on public.atlas_rate_limit_counters
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.atlas_consume_rate_limit(
  p_bucket text,
  p_subject_key text,
  p_max integer,
  p_window_ms integer,
  p_min_interval_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  now_ms bigint := (extract(epoch from now_ts) * 1000)::bigint;
  window_ms integer := greatest(p_window_ms, 1);
  max_hits integer := greatest(p_max, 0);
  min_interval integer := greatest(coalesce(p_min_interval_ms, 0), 0);
  window_start_ms bigint;
  window_started_at timestamptz;
  row_id text;
  current_count integer := 0;
  last_hit timestamptz;
  retry_ms integer := 0;
  elapsed_ms bigint;
begin
  if p_bucket is null or length(trim(p_bucket)) = 0 then
    raise exception 'bucket required';
  end if;
  if p_subject_key is null or length(trim(p_subject_key)) = 0 then
    raise exception 'subject_key required';
  end if;

  window_start_ms := (now_ms / window_ms) * window_ms;
  window_started_at := to_timestamp(window_start_ms / 1000.0);
  row_id := p_bucket || ':' || p_subject_key || ':' || window_start_ms::text;

  insert into public.atlas_rate_limit_counters as c (
    id, bucket, subject_key, window_started_at, window_ms, hit_count, last_hit_at, created_at, updated_at
  ) values (
    row_id, p_bucket, p_subject_key, window_started_at, window_ms, 0, now_ts, now_ts, now_ts
  )
  on conflict (id) do nothing;

  select c.hit_count, c.last_hit_at
    into current_count, last_hit
  from public.atlas_rate_limit_counters c
  where c.id = row_id
  for update;

  if last_hit is not null and min_interval > 0 then
    elapsed_ms := (extract(epoch from (now_ts - last_hit)) * 1000)::bigint;
    if elapsed_ms < min_interval then
      retry_ms := greatest((min_interval - elapsed_ms)::integer, 1);
      return jsonb_build_object(
        'allowed', false,
        'remaining', greatest(max_hits - current_count, 0),
        'retry_after_ms', retry_ms,
        'hit_count', current_count,
        'window_started_at', window_started_at
      );
    end if;
  end if;

  if current_count >= max_hits then
    retry_ms := greatest(((window_start_ms + window_ms) - now_ms)::integer, 1);
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_ms', retry_ms,
      'hit_count', current_count,
      'window_started_at', window_started_at
    );
  end if;

  update public.atlas_rate_limit_counters
  set hit_count = hit_count + 1,
      last_hit_at = now_ts,
      updated_at = now_ts,
      window_ms = window_ms
  where id = row_id
  returning hit_count into current_count;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(max_hits - current_count, 0),
    'retry_after_ms', 0,
    'hit_count', current_count,
    'window_started_at', window_started_at
  );
end;
$$;

revoke all on function public.atlas_consume_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.atlas_consume_rate_limit(text, text, integer, integer, integer)
  to service_role;
`;

export const RATE_LIMIT_TABLE = "atlas_rate_limit_counters" as const;
export const RATE_LIMIT_RPC = "atlas_consume_rate_limit" as const;
export const RATE_LIMIT_MIGRATION_NAME = "atlas_distributed_rate_limit" as const;
