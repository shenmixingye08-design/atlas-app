/**
 * Cutover observability — no secrets.
 */

export type DurableSotLogEvent =
  | "DURABLE_STORE_READ"
  | "DURABLE_STORE_WRITE"
  | "LEGACY_STORE_ACCESS_BLOCKED"
  | "MIGRATION_STARTED"
  | "MIGRATION_COMPLETED"
  | "MIGRATION_FAILED"
  | "CUTOVER_ENABLED"
  | "LEGACY_FALLBACK_ATTEMPTED"
  | "LEGACY_FALLBACK_BLOCKED"
  | "RECOVERY_AFTER_RESTART"
  | "DURABLE_SOT_UNAVAILABLE";

export type DurableSotLogFields = {
  event: DurableSotLogEvent;
  requestId?: string;
  runId?: string | null;
  jobId?: string | null;
  domain?: string;
  repository?: string;
  status?: string;
  durationMs?: number;
  diagnosticId?: string | null;
  errorCode?: string | null;
  detail?: string;
};

export function logDurableSot(fields: DurableSotLogFields): void {
  const payload = {
    channel: "atlas_durable_sot",
    ts: new Date().toISOString(),
    ...fields,
  };
  // Structured single-line log; never include secrets / payloads.
  console.info(JSON.stringify(payload));
}
