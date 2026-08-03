-- Phase 1-3 rollback: drop durable jobs/queue table and run idempotency column.

begin;

drop policy if exists "atlas_durable_jobs_deny" on public.atlas_durable_jobs;
drop table if exists public.atlas_durable_jobs cascade;

drop index if exists public.atlas_durable_runs_idempotency_key_uidx;
drop index if exists public.atlas_durable_runs_idempotency_key_idx;
alter table if exists public.atlas_durable_runs
  drop column if exists idempotency_key;

commit;
