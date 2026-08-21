import { safeLog } from "@/lib/security/redact";

export type DurableReadFailureLog = {
  endpoint: string;
  userId: string;
  code: string;
  databaseCode: string | null;
  table: string;
  rpc?: string | null;
  diagnosticId: string;
  message?: string;
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
  safeLog("error", `[${input.endpoint}] durable read failed`, {
    endpoint: input.endpoint,
    userId: input.userId,
    code: input.code,
    databaseCode: input.databaseCode,
    table: input.table,
    rpc: input.rpc ?? null,
    diagnosticId: input.diagnosticId,
    message: input.message ?? null,
  });
}
