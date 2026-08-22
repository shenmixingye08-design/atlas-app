-- Owner Dashboard Scale & Financial Trust
-- Non-destructive: new tables + RPCs only. Does not alter pricing, RLS on
-- existing tables, or billing entitlement contracts.

-- 1) Monthly AI cost aggregates (independent of the 5000-event detail log)
create table if not exists public.atlas_billing_ai_monthly (
  user_id text not null,
  month_key text not null,
  model text not null default '',
  feature text not null default '',
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(20, 8) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key, model, feature),
  constraint atlas_billing_ai_monthly_requests_check check (requests >= 0),
  constraint atlas_billing_ai_monthly_input_check check (input_tokens >= 0),
  constraint atlas_billing_ai_monthly_output_check check (output_tokens >= 0),
  constraint atlas_billing_ai_monthly_cost_check check (cost_usd >= 0)
);

create index if not exists atlas_billing_ai_monthly_month_idx
  on public.atlas_billing_ai_monthly (month_key);

alter table public.atlas_billing_ai_monthly enable row level security;

drop policy if exists "atlas_billing_ai_monthly_deny_anon"
  on public.atlas_billing_ai_monthly;
create policy "atlas_billing_ai_monthly_deny_anon"
  on public.atlas_billing_ai_monthly
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.atlas_billing_ai_monthly from anon, authenticated;
grant all on public.atlas_billing_ai_monthly to service_role;

create or replace function public.atlas_increment_ai_monthly(
  p_user_id text,
  p_month_key text,
  p_model text,
  p_feature text,
  p_requests integer,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requests integer := greatest(coalesce(p_requests, 0), 0);
  input_tokens bigint := greatest(coalesce(p_input_tokens, 0), 0);
  output_tokens bigint := greatest(coalesce(p_output_tokens, 0), 0);
  cost_usd numeric := greatest(coalesce(p_cost_usd, 0), 0);
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'user_id required';
  end if;
  if p_month_key is null or length(trim(p_month_key)) = 0 then
    raise exception 'month_key required';
  end if;

  insert into public.atlas_billing_ai_monthly as c (
    user_id, month_key, model, feature,
    requests, input_tokens, output_tokens, cost_usd, updated_at
  ) values (
    p_user_id,
    p_month_key,
    coalesce(p_model, ''),
    coalesce(p_feature, ''),
    requests,
    input_tokens,
    output_tokens,
    cost_usd,
    now()
  )
  on conflict (user_id, month_key, model, feature) do update
  set
    requests = c.requests + excluded.requests,
    input_tokens = c.input_tokens + excluded.input_tokens,
    output_tokens = c.output_tokens + excluded.output_tokens,
    cost_usd = c.cost_usd + excluded.cost_usd,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atlas_increment_ai_monthly(
  text, text, text, text, integer, bigint, bigint, numeric
) from public, anon, authenticated;
grant execute on function public.atlas_increment_ai_monthly(
  text, text, text, text, integer, bigint, bigint, numeric
) to service_role;

-- 2) Durable Stripe webhook telemetry (not the billing entitlement SoT)
create table if not exists public.atlas_stripe_webhook_telemetry (
  stripe_event_id text primary key,
  event_type text not null,
  status text not null,
  processed_at timestamptz not null,
  diagnostic_id text,
  plan_id text,
  user_id text,
  failure_code text,
  failure_reason text,
  created_at timestamptz not null default now(),
  constraint atlas_stripe_webhook_telemetry_status_check
    check (status in ('success', 'failure', 'skipped'))
);

create index if not exists atlas_stripe_webhook_telemetry_processed_idx
  on public.atlas_stripe_webhook_telemetry (processed_at desc);

alter table public.atlas_stripe_webhook_telemetry enable row level security;

drop policy if exists "atlas_stripe_webhook_telemetry_deny_anon"
  on public.atlas_stripe_webhook_telemetry;
create policy "atlas_stripe_webhook_telemetry_deny_anon"
  on public.atlas_stripe_webhook_telemetry
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.atlas_stripe_webhook_telemetry from anon, authenticated;
grant all on public.atlas_stripe_webhook_telemetry to service_role;
