-- Durable Stripe billing state for serverless (no .data FS dependency).
-- Apply in Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Writes use the service role key (bypasses RLS). Anon / authenticated cannot access.
-- Includes P0 FINAL GATE webhook claim lease columns (processing vs processed).

create table if not exists public.atlas_billing_subscriptions (
  user_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_id text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  automations_suspended boolean,
  payment_failure_grace_ends_at timestamptz,
  plan_profile_synced_at timestamptz
);

create index if not exists atlas_billing_subscriptions_stripe_customer_id_idx
  on public.atlas_billing_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists atlas_billing_subscriptions_stripe_subscription_id_idx
  on public.atlas_billing_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.atlas_stripe_webhook_events (
  event_id text primary key,
  event_type text,
  status text not null default 'processed',
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Idempotent upgrades for older installs that only had processed_at.
alter table public.atlas_stripe_webhook_events
  add column if not exists status text;
alter table public.atlas_stripe_webhook_events
  add column if not exists claimed_at timestamptz;
alter table public.atlas_stripe_webhook_events
  add column if not exists lease_expires_at timestamptz;
alter table public.atlas_stripe_webhook_events
  alter column processed_at drop not null;

update public.atlas_stripe_webhook_events
set
  status = coalesce(nullif(status, ''), 'processed'),
  claimed_at = coalesce(claimed_at, processed_at, now()),
  lease_expires_at = coalesce(lease_expires_at, processed_at, now()),
  processed_at = coalesce(processed_at, now())
where status is null
   or claimed_at is null
   or lease_expires_at is null;

alter table public.atlas_stripe_webhook_events
  alter column status set default 'processed';
update public.atlas_stripe_webhook_events set status = 'processed' where status is null;
alter table public.atlas_stripe_webhook_events
  alter column status set not null;

update public.atlas_stripe_webhook_events
set claimed_at = coalesce(claimed_at, now()) where claimed_at is null;
alter table public.atlas_stripe_webhook_events
  alter column claimed_at set default now();
alter table public.atlas_stripe_webhook_events
  alter column claimed_at set not null;

update public.atlas_stripe_webhook_events
set lease_expires_at = coalesce(lease_expires_at, claimed_at, now())
where lease_expires_at is null;
alter table public.atlas_stripe_webhook_events
  alter column lease_expires_at set default now();
alter table public.atlas_stripe_webhook_events
  alter column lease_expires_at set not null;

create index if not exists atlas_stripe_webhook_events_processing_lease_idx
  on public.atlas_stripe_webhook_events (status, lease_expires_at)
  where status = 'processing';

alter table public.atlas_billing_subscriptions enable row level security;
alter table public.atlas_stripe_webhook_events enable row level security;

drop policy if exists "atlas_billing_subscriptions_deny_anon"
  on public.atlas_billing_subscriptions;
drop policy if exists "atlas_stripe_webhook_events_deny_anon"
  on public.atlas_stripe_webhook_events;

create policy "atlas_billing_subscriptions_deny_anon"
  on public.atlas_billing_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "atlas_stripe_webhook_events_deny_anon"
  on public.atlas_stripe_webhook_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
