import "server-only";

import {
  assertJobTransition,
  canMarkJobCompleted,
  classifyWorkJobError,
  isTerminalJobStatus,
  normalizeJobBlockReason,
  normalizeJobStatus,
  timestampsForTransition,
  userMessageForJobError,
  type CanonicalJobStatus,
  type JobBlockReason,
  type WorkJobErrorCode,
} from "./job-status";
import { getWorkJob, saveWorkJob, type WorkJobRecord } from "./store";

export type ApplyJobStatusInput = {
  jobId: string;
  userId: string;
  to: CanonicalJobStatus;
  /** Optional pause while status remains processing. */
  blockReason?: JobBlockReason;
  errorCode?: WorkJobErrorCode | null;
  /** Internal detail (logged / stored, not shown raw). */
  internalError?: string | null;
  /** Override user message; otherwise derived from errorCode. */
  userMessage?: string | null;
  result?: WorkJobRecord["result"];
  attemptCount?: number;
  /** Required when transitioning to completed. */
  completionGate?: {
    projectPersisted: boolean;
    wordRequired: boolean;
    wordDeliverablePresent: boolean;
    wordCompletionVerified?: boolean;
    notificationCreated?: boolean;
  };
  /** Extra metadata patch (idempotency / correlation). */
  metadataPatch?: Readonly<Record<string, unknown>>;
};

export type ApplyJobStatusResult =
  | { ok: true; job: WorkJobRecord; noop: boolean }
  | {
      ok: false;
      code: WorkJobErrorCode;
      message: string;
      job: WorkJobRecord | null;
    };

/**
 * Apply a canonical status transition with validation, timestamp rules,
 * and completed-artifact gate. Rejects illegal transitions without mutating.
 */
export function applyJobStatusTransition(
  input: ApplyJobStatusInput,
): ApplyJobStatusResult {
  const current = getWorkJob(input.jobId, input.userId);
  if (!current) {
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message: "job_not_found",
      job: null,
    };
  }

  const from =
    normalizeJobStatus(current.status) ??
    ("failed" as CanonicalJobStatus);

  // Terminal jobs are immutable — retries must create a new attempt/job.
  if (isTerminalJobStatus(from) && input.to !== from) {
    return {
      ok: false,
      code: "JOB_STATUS_UPDATE_FAILED",
      message: `terminal_immutable:${from}->${input.to}`,
      job: current,
    };
  }

  const transition = assertJobTransition(from, input.to);
  if (!transition.ok) {
    return {
      ok: false,
      code: transition.code,
      message: transition.message,
      job: current,
    };
  }

  if (input.to === "completed") {
    const gate = input.completionGate;
    if (!gate) {
      return {
        ok: false,
        code: "ARTIFACT_DB_SAVE_FAILED",
        message: "completed_requires_completion_gate",
        job: current,
      };
    }
    const allowed = canMarkJobCompleted(gate);
    if (!allowed.ok) {
      return {
        ok: false,
        code: allowed.code,
        message: `completed_gate_failed:${allowed.code}`,
        job: current,
      };
    }
  }

  // Pure no-op only when nothing else (block / metadata / attempt / result) changes.
  if (
    transition.noop &&
    input.blockReason === undefined &&
    input.metadataPatch === undefined &&
    input.attemptCount === undefined &&
    input.result === undefined
  ) {
    return { ok: true, job: current, noop: true };
  }

  const nowIso = new Date().toISOString();
  const stamps = timestampsForTransition(input.to, nowIso, current);

  const errorCode =
    input.to === "failed" || input.to === "timed_out"
      ? input.errorCode ??
        classifyWorkJobError(input.internalError ?? current.internalError)
      : null;

  const userError =
    input.to === "failed" || input.to === "timed_out"
      ? userMessageForJobError(
          errorCode,
          input.userMessage ?? input.internalError ?? current.error,
        )
      : null;

  const blockReason: JobBlockReason =
    input.to === "processing"
      ? input.blockReason !== undefined
        ? input.blockReason
        : normalizeJobBlockReason(null, current.blockReason)
      : null;

  const next: WorkJobRecord = {
    ...current,
    status: input.to,
    blockReason,
    errorCode,
    internalError:
      input.to === "failed" || input.to === "timed_out"
        ? (input.internalError ?? current.internalError ?? errorCode)?.slice(
            0,
            500,
          ) ?? null
        : null,
    error: userError,
    result: input.result !== undefined ? input.result : current.result,
    attemptCount: input.attemptCount ?? current.attemptCount,
    startedAt: stamps.startedAt,
    completedAt: stamps.completedAt,
    failedAt: stamps.failedAt,
    updatedAt: stamps.updatedAt,
    metadata: {
      ...(current.metadata ?? {}),
      ...(input.metadataPatch ?? {}),
    },
  };

  return { ok: true, job: saveWorkJob(next), noop: false };
}
