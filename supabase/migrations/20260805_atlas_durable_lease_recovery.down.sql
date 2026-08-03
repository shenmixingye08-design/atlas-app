-- Phase 1-4 rollback: drop recovery ledger / metrics and fencing columns.

begin;

drop policy if exists "atlas_durable_job_recoveries_deny" on public.atlas_durable_job_recoveries;
drop policy if exists "atlas_durable_lease_metrics_deny" on public.atlas_durable_lease_metrics;
drop table if exists public.atlas_durable_job_recoveries cascade;
drop table if exists public.atlas_durable_lease_metrics cascade;

drop index if exists public.atlas_durable_jobs_lease_token_idx;
alter table if exists public.atlas_durable_jobs
  drop column if exists lease_token,
  drop column if exists lease_version,
  drop column if exists worker_instance_id,
  drop column if exists worker_started_at;

drop index if exists public.atlas_durable_leases_token_idx;
alter table if exists public.atlas_durable_leases
  drop column if exists lease_token,
  drop column if exists lease_version,
  drop column if exists heartbeat_at,
  drop column if exists worker_started_at,
  drop column if exists worker_instance_id,
  drop column if exists released_at,
  drop column if exists release_reason;

alter table if exists public.atlas_durable_heartbeats
  drop column if exists lease_token,
  drop column if exists current_step_id,
  drop column if exists current_stage,
  drop column if exists progress_marker,
  drop column if exists last_external_action_id,
  drop column if exists last_artifact_id,
  drop column if exists worker_instance_id;

commit;
