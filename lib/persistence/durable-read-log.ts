import {
  logProductionApiError,
  type ProductionErrorSubsystem,
} from "@/lib/reliability/production-error-log";

export type DurableReadFailureLog = {
  endpoint: string;
  userId: string;
  code: string;
  databaseCode: string | null;
  table: string;
  rpc?: string | null;
  diagnosticId: string;
  message?: string;
  subsystem?: ProductionErrorSubsystem;
  failureStage?: string;
};

export function buildDurableReadDiagnosticId(scope: string): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `diag_${Date.now().toString(36)}`;
  return `read_${scope}_${id}`;
}

export function readUnknownSupabaseError(error: unknown): {
  message: string;
  code: string | null;
} {
  if (!error || typeof error !== "object") {
    return { message: String(error ?? "unknown"), code: null };
  }
  const record = error as { message?: unknown; code?: unknown };
  return {
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message
        : "unknown",
    code: typeof record.code === "string" && record.code.trim() ? record.code : null,
  };
}

/**
 * Server-only diagnostic for durable read failures.
 * Never include secrets / raw env / service-role material.
 */
export function logDurableReadFailure(input: DurableReadFailureLog): void {
  logProductionApiError({
    endpoint: input.endpoint,
    code: input.code,
    diagnosticId: input.diagnosticId,
    failureStage: input.failureStage ?? "durable_read",
    subsystem: input.subsystem ?? inferSubsystem(input.endpoint, input.table),
    databaseCode: input.databaseCode,
    userId: input.userId,
    message: input.message ?? null,
  });
}

function inferSubsystem(
  endpoint: string,
  table: string,
): ProductionErrorSubsystem {
  if (endpoint.includes("billing") || table.includes("billing")) return "billing";
  if (endpoint.includes("automation") || table.includes("automation")) {
    return "automations";
  }
  if (endpoint.includes("work") || table.includes("work_job")) return "work_jobs";
  return "unknown";
}
