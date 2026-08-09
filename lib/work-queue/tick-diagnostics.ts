/**
 * Safe Production diagnostics for /api/automations/tick failures.
 * Never expose connection strings, secrets, or raw Error.message.
 */

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";

import { WorkQueueStoreUnavailableError } from "./store";

export type TickDeveloperCode =
  | "work_queue_store_unavailable"
  | "work_queue_force_file_forbidden"
  | "work_queue_schema_missing"
  | "work_queue_db_unreachable"
  | "work_queue_query_failed"
  | "hydrate_failed"
  | "unknown";

export type TickFailureDiagnostics = {
  failedStage: "work_queue" | "post_success_record" | "unknown";
  developerCode: TickDeveloperCode;
  postgresUrlConfigured: boolean;
  /** True when only non-legacy Postgres env keys are set (historical gap). */
  extendedPostgresUrlOnly: boolean;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function classifyTickFailure(
  error: unknown,
  stage: TickFailureDiagnostics["failedStage"] = "unknown",
): TickFailureDiagnostics {
  const url = resolveAtlasPostgresUrl();
  const base = {
    failedStage: stage,
    postgresUrlConfigured: Boolean(url.connectionString),
    extendedPostgresUrlOnly: url.extendedOnlyPresent,
  };

  if (error instanceof WorkQueueStoreUnavailableError) {
    if (/FORCE_FILE/i.test(error.message)) {
      return { ...base, failedStage: "work_queue", developerCode: "work_queue_force_file_forbidden" };
    }
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "work_queue_store_unavailable",
    };
  }

  const msg = messageOf(error);
  const lower = msg.toLowerCase();

  if (
    /does not exist|undefined_table|schema cache|atlas_work_queue_/i.test(msg)
  ) {
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "work_queue_schema_missing",
    };
  }

  if (
    /econnrefused|enotfound|econnreset|connection terminated|timeout|ssl|password authentication|too many connections/i.test(
      lower,
    )
  ) {
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "work_queue_db_unreachable",
    };
  }

  if (/hydrat|atlas_user_state|durable/i.test(lower)) {
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "hydrate_failed",
    };
  }

  if (stage === "work_queue" || /work.?queue|leaseJobs|listStuck|metrics/i.test(msg)) {
    return {
      ...base,
      failedStage: "work_queue",
      developerCode: "work_queue_query_failed",
    };
  }

  return { ...base, developerCode: "unknown" };
}
