/**
 * N-07: Canonical execution result for work / automation / notifications.
 * Notification copy and channel ACK must derive from this — never invent success.
 */

import type { JobStatus } from "@/lib/jobs/types";
import type { NotificationType } from "@/lib/notifications/types";

/** User-facing / job-aligned execution status. */
export type ExecutionStatus =
  | "SUCCESS"
  | "FAILED"
  | "PARTIAL"
  | "RUNNING"
  | "WAITING"
  | "RETRYING"
  | "UNKNOWN";

export type ExecutionEvidence = {
  artifactIds: string[];
  storageUrls: string[];
  externalActionIds: string[];
  externalUrls: string[];
  providerResourceId: string | null;
  sideEffectConfirmed: boolean;
};

export type CanonicalExecutionResult = {
  executionStatus: ExecutionStatus;
  /** Always false — soft-success is forbidden (mirrors OCR engine). */
  softSuccess: false;
  /** True only when SUCCESS and sideEffectConfirmed. */
  userCompleteClaimAllowed: boolean;
  notificationType: NotificationType;
  jobStatus: JobStatus;
  evidence: ExecutionEvidence;
  failureStage: string | null;
  summary: string;
  errorCode: string | null;
  attempt: number;
  maxAttempts: number;
  correlationId: string | null;
  jobId: string | null;
};

export function emptyEvidence(
  overrides?: Partial<ExecutionEvidence>,
): ExecutionEvidence {
  return {
    artifactIds: [],
    storageUrls: [],
    externalActionIds: [],
    externalUrls: [],
    providerResourceId: null,
    sideEffectConfirmed: false,
    ...overrides,
  };
}

export function notificationTypeForStatus(
  status: ExecutionStatus,
): NotificationType {
  switch (status) {
    case "SUCCESS":
      return "completed";
    case "PARTIAL":
    case "WAITING":
      return "awaiting_review";
    case "FAILED":
    case "UNKNOWN":
      return "error";
    case "RETRYING":
    case "RUNNING":
      return "automation";
    default:
      return "error";
  }
}

/**
 * Build a canonical result. SUCCESS requires sideEffectConfirmed === true.
 * Timeout / unknown / missing artifact never become SUCCESS.
 */
export function buildCanonicalExecutionResult(input: {
  executionStatus: ExecutionStatus;
  evidence?: Partial<ExecutionEvidence>;
  failureStage?: string | null;
  summary: string;
  errorCode?: string | null;
  attempt?: number;
  maxAttempts?: number;
  correlationId?: string | null;
  jobId?: string | null;
}): CanonicalExecutionResult {
  const evidence = emptyEvidence(input.evidence);
  let executionStatus = input.executionStatus;

  if (executionStatus === "SUCCESS" && !evidence.sideEffectConfirmed) {
    executionStatus = "FAILED";
  }

  const userCompleteClaimAllowed =
    executionStatus === "SUCCESS" && evidence.sideEffectConfirmed === true;

  const jobStatus: CanonicalExecutionResult["jobStatus"] =
    executionStatus === "SUCCESS"
      ? "completed"
      : executionStatus === "PARTIAL"
        ? "partially_completed"
        : executionStatus === "WAITING"
          ? "waiting_for_approval"
          : executionStatus === "RETRYING" || executionStatus === "RUNNING"
            ? "retrying"
            : "failed";

  return {
    executionStatus,
    softSuccess: false,
    userCompleteClaimAllowed,
    notificationType: notificationTypeForStatus(executionStatus),
    jobStatus,
    evidence,
    failureStage: input.failureStage ?? null,
    summary: input.summary,
    errorCode: input.errorCode ?? null,
    attempt: input.attempt ?? 1,
    maxAttempts: input.maxAttempts ?? 1,
    correlationId: input.correlationId ?? null,
    jobId: input.jobId ?? null,
  };
}

/** Map completion-evidence JobStatus into ExecutionStatus. */
export function executionStatusFromJobStatus(
  status: JobStatus,
): ExecutionStatus {
  switch (status) {
    case "completed":
      return "SUCCESS";
    case "partially_completed":
      return "PARTIAL";
    case "waiting_for_approval":
      return "WAITING";
    case "retrying":
      return "RETRYING";
    case "queued":
    case "running":
    case "scheduled":
      return "RUNNING";
    case "failed":
    case "cancelled":
    default:
      return "FAILED";
  }
}
