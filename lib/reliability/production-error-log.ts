import { redactSecrets, safeLog } from "@/lib/security/redact";

export const PRODUCTION_ERROR_SUBSYSTEMS = [
  "billing",
  "automations",
  "work_jobs",
  "scheduler",
  "integrations",
  "images",
  "deliverables",
  "auth",
  "health",
  "unknown",
] as const;

export type ProductionErrorSubsystem =
  (typeof PRODUCTION_ERROR_SUBSYSTEMS)[number];

export type ProductionApiErrorLog = {
  endpoint: string;
  code: string;
  diagnosticId: string;
  correlationId?: string | null;
  failureStage: string;
  subsystem: ProductionErrorSubsystem;
  databaseCode?: string | null;
  userId?: string | null;
  message?: string | null;
};

export function buildProductionDiagnosticId(scope: string): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `diag_${Date.now().toString(36)}`;
  return `p5_${scope}_${id}`;
}

/** Never log raw user ids — presence only. */
export function fingerprintLogUserId(
  userId: string | null | undefined,
): "present" | null {
  return userId && userId.trim() ? "present" : null;
}

/**
 * Structured Production API error log.
 * Secrets, tokens, and private content must never appear.
 */
export function logProductionApiError(input: ProductionApiErrorLog): void {
  const payload = redactSecrets({
    endpoint: input.endpoint,
    code: input.code,
    diagnosticId: input.diagnosticId,
    correlationId: input.correlationId ?? null,
    failureStage: input.failureStage,
    subsystem: input.subsystem,
    databaseCode: input.databaseCode ?? null,
    userId: fingerprintLogUserId(input.userId),
    message: input.message ?? null,
  });
  safeLog("error", `[${input.endpoint}] production failure`, payload);
}
