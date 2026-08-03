-- Phase 1-2 Durable SoT foundation — ROLLBACK (Down).
-- Drops atlas_durable_* tables/policies created by 20260803_atlas_durable_sot.sql.
-- Safe to re-run (IF EXISTS). Does not touch atlas_work_queue_* or automation tables.

begin;

-- Break circular FK occurrence ↔ run before drops.
alter table if exists public.atlas_durable_scheduler_occurrences
  drop constraint if exists atlas_durable_occurrences_run_fk;

drop policy if exists "atlas_durable_idempotency_deny" on public.atlas_durable_idempotency_keys;
drop policy if exists "atlas_durable_evidence_deny" on public.atlas_durable_completion_evidence;
drop policy if exists "atlas_durable_recovery_deny" on public.atlas_durable_recovery_states;
drop policy if exists "atlas_durable_retry_deny" on public.atlas_durable_retry_states;
drop policy if exists "atlas_durable_heartbeats_deny" on public.atlas_durable_heartbeats;
drop policy if exists "atlas_durable_leases_deny" on public.atlas_durable_leases;
drop policy if exists "atlas_durable_steps_deny" on public.atlas_durable_steps;
drop policy if exists "atlas_durable_runs_deny" on public.atlas_durable_runs;
drop policy if exists "atlas_durable_occurrences_deny" on public.atlas_durable_scheduler_occurrences;

drop table if exists public.atlas_durable_idempotency_keys cascade;
drop table if exists public.atlas_durable_completion_evidence cascade;
drop table if exists public.atlas_durable_recovery_states cascade;
drop table if exists public.atlas_durable_retry_states cascade;
drop table if exists public.atlas_durable_heartbeats cascade;
drop table if exists public.atlas_durable_leases cascade;
drop table if exists public.atlas_durable_steps cascade;
drop table if exists public.atlas_durable_runs cascade;
drop table if exists public.atlas_durable_scheduler_occurrences cascade;

commit;
