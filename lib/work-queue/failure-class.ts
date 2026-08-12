/**
 * Safe classification of work-queue / drain failures for Production ops.
 * Never exposes connection strings, SQL, or raw Error.message to clients.
 */

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";

import { WorkQueueStoreUnavailableError } from "./store";

export type WorkQueueDeveloperCode =
  | "work_queue_store_unavailable"
  | "work_queue_force_file_forbidden"
  | "work_queue_schema_missing"
  | "work_queue_db_unreachable"
  | "work_queue_pool_exhausted"
  | "work_queue_query_failed"
  | "work_queue_job_execution_failed"
  | "hydrate_failed"
  | "unknown";

/** Operational class for HTTP / scheduler policy. */
export type WorkQueueFailureClass = "noop" | "retryable" | "fatal";

export type WorkQueueFailureDiagnostics = {
  failedStage: "work_queue" | "drain" | "post_success_record" | "unknown";
  developerCode: WorkQueueDeveloperCode;
  failureClass: WorkQueueFailureClass;
  postgresUrlConfigured: boolean;
  /** True when only non-legacy Postgres env keys are set (historical gap). */
  extendedPostgresUrlOnly: boolean;
  /** Error.name only (safe). */
  errorName: string | null;
  /** Postgres SQLSTATE when present (e.g. 53300) — safe short code. */
  pgCode: string | null;
  /** Optional substage tag from processWorkQueueTick / drain. */
  substage: string | null;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function errorNameOf(error: unknown): string | null {
  if (error instanceof Error && error.name.trim()) return error.name.slice(0, 80);
  return null;
}

function pgCodeOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/i.test(code)) {
    return code.toUpperCase();
  }
  return null;
}

function substageOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const stage = (error as { workQueueSubstage?: unknown }).workQueueSubstage;
  if (typeof stage === "string" && stage.trim()) {
    return stage.trim().slice(0, 64);
  }
  return null;
}

/** Tag an error with a work-queue substage for diagnostics (in-process only). */
export function tagWorkQueueError(
  error: unknown,
  substage: string,
): Error {
  const base =
    error instanceof Error ? error : new Error(messageOf(error) || "work_queue_error");
  (base as Error & { workQueueSubstage?: string }).workQueueSubstage = substage;
  return base;
}

export function isRetryableWorkQueueFailure(
  diag: Pick<WorkQueueFailureDiagnostics, "failureClass" | "developerCode">,
): boolean {
  return (
    diag.failureClass === "retryable" ||
    diag.developerCode === "work_queue_db_unreachable" ||
    diag.developerCode === "work_queue_pool_exhausted"
  );
}

/**
 * Classify tick / drain failures for safe Production responses.
 */
export function classifyWorkQueueFailure(
  error: unknown,
  stage: WorkQueueFailureDiagnostics["failedStage"] = "unknown",
): WorkQueueFailureDiagnostics {
  const url = resolveAtlasPostgresUrl();
  const base = {
    failedStage: stage,
    postgresUrlConfigured: Boolean(url.connectionString),
    extendedPostgresUrlOnly: url.extendedOnlyPresent,
    errorName: errorNameOf(error),
    pgCode: pgCodeOf(error),
    substage: substageOf(error),
  };

  if (error instanceof WorkQueueStoreUnavailableError) {
    if (/FORCE_FILE/i.test(error.message)) {
      return {
        ...base,
        failedStage: "work_queue",
        developerCode: "work_queue_force_file_forbidden",
        failureClass: "fatal",
      };
    }
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "work_queue_store_unavailable",
      failureClass: "fatal",
    };
  }

  const msg = messageOf(error);
  const lower = msg.toLowerCase();
  const pg = base.pgCode;

  if (
    /does not exist|undefined_table|schema cache|atlas_work_queue_/i.test(msg)
  ) {
    return {
      ...base,
      failedStage: stage === "drain" ? "drain" : "work_queue",
      developerCode: "work_queue_schema_missing",
      failureClass: "fatal",
    };
  }

  // Production evidence pattern: concurrent drain_3 / tick fan-out under
  // Supabase pooler → "MaxClientsInSessionMode: max clients reached"
  // (previously misclassified as work_queue_query_failed).
  if (
    /maxclientsinsessionmode|max clients reached|remaining connection slots|too many clients|too many connections|connlimit|connection pool/i.test(
      lower,
    ) ||
    pg === "53300" ||
    pg === "53400"
  ) {
    return {
      ...base,
      failedStage: stage === "drain" ? "drain" : "work_queue",
      developerCode: "work_queue_pool_exhausted",
      failureClass: "retryable",
    };
  }

  if (
    /econnrefused|enotfound|econnreset|connection terminated|timeout|timed out|ssl|password authentication|could not connect|connection refused|socket hang up|fetch failed/i.test(
      lower,
    ) ||
    pg === "08000" ||
    pg === "08006" ||
    pg === "57P01" ||
    pg === "57P03"
  ) {
    return {
      ...base,
      failedStage: stage === "drain" ? "drain" : "work_queue",
      developerCode: "work_queue_db_unreachable",
      failureClass: "retryable",
    };
  }

  if (/hydrat|atlas_user_state|durable/i.test(lower)) {
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "hydrate_failed",
      failureClass: "retryable",
    };
  }

  if (
    /notification_create_failed|step_not_found|max_execution|job_execution/i.test(
      lower,
    ) ||
    base.substage === "job_execution"
  ) {
    return {
      ...base,
      failedStage: stage === "drain" ? "drain" : "work_queue",
      developerCode: "work_queue_job_execution_failed",
      // Per-job execution issues must not fail the whole minute drain as fatal
      // ops outage — worker records job failure; drain can continue.
      failureClass: "retryable",
    };
  }

  if (
    stage === "work_queue" ||
    stage === "drain" ||
    /work.?queue|leaseJobs|listStuck|metrics|drain/i.test(msg)
  ) {
    return {
      ...base,
      failedStage: stage === "drain" ? "drain" : "work_queue",
      developerCode: "work_queue_query_failed",
      failureClass: "retryable",
    };
  }

  return {
    ...base,
    developerCode: "unknown",
    failureClass: "fatal",
  };
}

/** @deprecated Use classifyWorkQueueFailure — kept for existing imports. */
export function classifyTickFailure(
  error: unknown,
  stage: "work_queue" | "post_success_record" | "unknown" = "unknown",
): WorkQueueFailureDiagnostics {
  return classifyWorkQueueFailure(error, stage);
}

export type TickDeveloperCode = WorkQueueDeveloperCode;
export type TickFailureDiagnostics = WorkQueueFailureDiagnostics;
