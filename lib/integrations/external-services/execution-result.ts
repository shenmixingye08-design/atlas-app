/**
 * Common External Execution Result — unified across Production Live Adapters.
 */

export const EXTERNAL_ADAPTER_MODE = "production" as const;

export type ExternalExecutionStatus =
  | "verified"
  | "awaiting_approval"
  | "retrying"
  | "failed";

export type ExternalServiceName =
  | "google_drive"
  | "gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress";

/**
 * Minimum shared shape for every Production Live Adapter execution result.
 * Service-specific metadata lives in `metadata` / evidence fragments.
 */
export type ExternalExecutionResult = {
  status: ExternalExecutionStatus;
  service: ExternalServiceName;
  action: string;
  externalActionId: string;
  externalUrl: string | null;
  providerRequestId: string | null;
  startedAt: string;
  completedAt: string | null;
  retryCount: number;
  idempotencyKey: string;
  adapterMode: typeof EXTERNAL_ADAPTER_MODE;
  environment: string;
  diagnosticId: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
};

export function assertExternalExecutionResultComplete(
  result: ExternalExecutionResult,
  options?: { requireUrl?: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (result.adapterMode !== "production") {
    return { ok: false, reason: "adapterMode must be production" };
  }
  if (!result.externalActionId.trim()) {
    return { ok: false, reason: "externalActionId required" };
  }
  if (options?.requireUrl && !result.externalUrl?.trim()) {
    return { ok: false, reason: "externalUrl required" };
  }
  if (result.status === "verified" && !result.completedAt) {
    return { ok: false, reason: "completedAt required for verified status" };
  }
  return { ok: true };
}
