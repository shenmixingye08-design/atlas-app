/** Canonical table names for Durable SoT (Phase 1-2). */
export const DURABLE_SOT_TABLES = {
  runs: "atlas_durable_runs",
  steps: "atlas_durable_steps",
  leases: "atlas_durable_leases",
  heartbeats: "atlas_durable_heartbeats",
  retryStates: "atlas_durable_retry_states",
  recoveryStates: "atlas_durable_recovery_states",
  occurrences: "atlas_durable_scheduler_occurrences",
  evidence: "atlas_durable_completion_evidence",
  idempotencyKeys: "atlas_durable_idempotency_keys",
} as const;

export const DURABLE_SOT_MIGRATION_UP =
  "supabase/migrations/20260803_atlas_durable_sot.sql";
export const DURABLE_SOT_MIGRATION_DOWN =
  "supabase/migrations/20260803_atlas_durable_sot.down.sql";

/** Required unique constraints (names as declared / inferred). */
export const DURABLE_SOT_UNIQUE_CONSTRAINTS = [
  "atlas_durable_scheduler_occurrences_automation_id_occurrence_key_key",
  "atlas_durable_steps_run_id_step_index_key",
  "atlas_durable_completion_evidence_run_id_evidence_kind_evidence_fingerprint_key",
  "atlas_durable_idempotency_keys_pkey",
  "atlas_durable_leases_pkey", // one lease per run
  "atlas_durable_runs_pkey",
] as const;

export const DURABLE_SOT_REQUIRED_INDEX_FRAGMENTS = [
  "atlas_durable_runs_run_id_idx",
  "atlas_durable_runs_job_id_idx",
  "atlas_durable_runs_occurrence_id_idx",
  "atlas_durable_runs_status_idx",
  "atlas_durable_runs_created_at_idx",
  "atlas_durable_runs_updated_at_idx",
  "atlas_durable_leases_lease_owner_idx",
  "atlas_durable_heartbeats_heartbeat_at_idx",
  "atlas_durable_retry_retry_at_idx",
  "atlas_durable_idempotency_key_idx",
  "atlas_durable_occurrences_occurrence_id_idx",
] as const;
