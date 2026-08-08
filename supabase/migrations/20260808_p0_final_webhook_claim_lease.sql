-- P0 FINAL GATE: separate webhook claim (processing+lease) from processed.
-- Safe to re-run. Service role writes; anon/authenticated denied via existing RLS.

create table if not exists public.atlas_stripe_webhook_events (
  event_id text primary key,
  event_type text,
  status text not null default 'processed',
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.atlas_stripe_webhook_events
  add column if not exists status text;

alter table public.atlas_stripe_webhook_events
  add column if not exists claimed_at timestamptz;

alter table public.atlas_stripe_webhook_events
  add column if not exists lease_expires_at timestamptz;

-- Legacy rows used processed_at as "done". Keep history; allow null for in-flight claims.
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

update public.atlas_stripe_webhook_events
set status = 'processed'
where status is null;

alter table public.atlas_stripe_webhook_events
  alter column status set not null;

update public.atlas_stripe_webhook_events
set claimed_at = coalesce(claimed_at, now())
where claimed_at is null;

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

alter table public.atlas_stripe_webhook_events enable row level security;

drop policy if exists "atlas_stripe_webhook_events_deny_anon"
  on public.atlas_stripe_webhook_events;

create policy "atlas_stripe_webhook_events_deny_anon"
  on public.atlas_stripe_webhook_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
