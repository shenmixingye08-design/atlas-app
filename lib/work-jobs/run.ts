import "server-only";

import { runCommanderRequest } from "@/lib/commander/service";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

import {
  classifyWorkJobError,
  isStaleProcessingJob,
  isTerminalJobStatus,
  JOB_STALE_PROCESSING_MS,
  userMessageForJobError,
  type CanonicalJobStatus,
} from "./job-status";
import { getWorkJob, type WorkJobRecord } from "./store";
import { applyJobStatusTransition } from "./transition";

/**
 * @deprecated Use JOB_STALE_PROCESSING_MS from job-status.
 * Kept so existing imports keep compiling during migration.
 */
export const WORK_JOB_STALE_RUNNING_MS = JOB_STALE_PROCESSING_MS;

/** Detect processing jobs that have not been heartbeated recently. */
export function isStaleWorkJobRunning(
  job: WorkJobRecord,
  nowMs = Date.now(),
): boolean {
  const status = job.status as CanonicalJobStatus | "running";
  // Accept legacy "running" for callers that have not normalized yet.
  if (status !== "processing" && status !== "running") return false;
  return isStaleProcessingJob(
    { status: "processing", updatedAt: job.updatedAt },
    nowMs,
  );
}

export function isWorkJobTerminal(status: WorkJobRecord["status"]): boolean {
  return isTerminalJobStatus(status);
}

function mapCommanderToTerminal(input: {
  commanderStatus: string;
  persistence?: {
    projectPersisted: boolean;
    wordRequired: boolean;
    wordDeliverableId: string | null;
    notificationCreated: boolean;
  } | null;
  visionFailed: boolean;
}): {
  to: CanonicalJobStatus;
  errorCode?: import("./job-status").WorkJobErrorCode | null;
  internalError?: string | null;
  blockReason?: import("./job-status").JobBlockReason;
  completionGate?: {
    projectPersisted: boolean;
    wordRequired: boolean;
    wordDeliverablePresent: boolean;
  };
} {
  if (input.commanderStatus === "awaiting_confirmation") {
    return {
      to: "processing",
      blockReason: "awaiting_confirmation",
    };
  }

  if (input.commanderStatus === "cancelled") {
    return { to: "cancelled" };
  }

  if (input.visionFailed) {
    return {
      to: "failed",
      errorCode: "AI_GENERATION_FAILED",
      internalError: "vision_gate_failed",
    };
  }

  if (
    input.commanderStatus === "failed" ||
    input.commanderStatus === "planning" ||
    input.commanderStatus === "running"
  ) {
    return {
      to: "failed",
      errorCode: "AI_GENERATION_FAILED",
      internalError: `commander:${input.commanderStatus}`,
    };
  }

  // completed / partial → require durable artifact gate
  const persistence = input.persistence;
  const gate = {
    projectPersisted: Boolean(persistence?.projectPersisted),
    wordRequired: Boolean(persistence?.wordRequired),
    wordDeliverablePresent: Boolean(persistence?.wordDeliverableId),
  };

  if (!gate.projectPersisted) {
    return {
      to: "failed",
      errorCode: "ARTIFACT_DB_SAVE_FAILED",
      internalError: "project_persist_failed",
    };
  }

  if (gate.wordRequired && !gate.wordDeliverablePresent) {
    return {
      to: "failed",
      errorCode: "DOCX_GENERATION_FAILED",
      internalError: "word_deliverable_missing_after_success",
    };
  }

  return {
    to: "completed",
    completionGate: gate,
  };
}

/**
 * Execute a queued work job on the server (not in the browser).
 * Retries transient failures up to maxAttempts with backoff.
 * Idempotent: terminal jobs are not re-executed.
 * Stale `processing` jobs are reclaimed so work never stays 処理中 forever.
 */
export async function executeWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  // Terminal jobs are immutable — retries must use a new job / attempt.
  if (isTerminalJobStatus(existing.status)) {
    return existing;
  }

  // Confirmation pause: still processing, but do not re-enter the pipeline.
  if (existing.blockReason === "awaiting_confirmation") {
    return existing;
  }

  // Fresh processing lease — another worker is actively processing.
  if (
    existing.status === "processing" &&
    !isStaleWorkJobRunning(existing)
  ) {
    return existing;
  }

  // Stale processing past maxAttempts → timed_out (never leave 処理中).
  if (
    existing.status === "processing" &&
    isStaleWorkJobRunning(existing) &&
    existing.attemptCount >= existing.maxAttempts
  ) {
    const applied = applyJobStatusTransition({
      jobId,
      userId,
      to: "timed_out",
      errorCode: "TIMEOUT",
      internalError: "stale_processing_max_attempts",
      userMessage: userMessageForJobError("TIMEOUT"),
      metadataPatch: {
        timeoutReason: "stale_processing_max_attempts",
      },
    });
    if (!applied.ok || !applied.job) {
      throw new Error(applied.ok === false ? applied.message : "timed_out_failed");
    }
    return applied.job;
  }

  const nextAttempt = existing.attemptCount + 1;
  const start = applyJobStatusTransition({
    jobId,
    userId,
    to: "processing",
    blockReason: null,
    attemptCount: nextAttempt,
    metadataPatch: {
      lastAttemptStartedAt: new Date().toISOString(),
    },
  });
  if (!start.ok || !start.job) {
    // Illegal transition (e.g. raced into terminal) — return current.
    return getWorkJob(jobId, userId) ?? existing;
  }

  const startedAt = Date.now();

  try {
    const commander = await withRetry(
      async (attempt) => {
        if (attempt > 1) {
          recordReliabilityEvent("retry", "retry");
          recordReliabilityEvent("work_job", "retry");
        }
        // Heartbeat so long runs are not mistaken for stale hangs.
        const current = getWorkJob(jobId, userId);
        if (current?.status === "processing") {
          applyJobStatusTransition({
            jobId,
            userId,
            to: "processing",
            blockReason: current.blockReason,
            metadataPatch: {
              heartbeatAt: new Date().toISOString(),
            },
          });
        }
        return runCommanderRequest({
          userId,
          request: {
            assignment: existing.assignment,
            mode: "execute",
            metadata: {
              requestUi: "secretary_zero_friction_v1",
              ...(existing.metadata ?? {}),
              workJobId: jobId,
              idempotencyKey: existing.idempotencyKey,
            },
          },
        });
      },
      { maxAttempts: existing.maxAttempts },
    );

    // Confirmation wait: stay processing with blockReason (not a 7th status).
    if (commander.status === "awaiting_confirmation") {
      const applied = applyJobStatusTransition({
        jobId,
        userId,
        to: "processing",
        blockReason: "awaiting_confirmation",
        attemptCount: nextAttempt,
        result: commander.result ?? null,
      });
      return applied.ok && applied.job
        ? applied.job
        : (getWorkJob(jobId, userId) ?? existing);
    }

    const visionFailed = Boolean(
      commander.visionGate && !commander.visionGate.analysisSuccess,
    );

    const mapped = mapCommanderToTerminal({
      commanderStatus: commander.status,
      persistence: commander.persistence ?? null,
      visionFailed,
    });

    if (mapped.to === "completed") {
      recordReliabilityEvent("work_job", "success", 1, {
        durationMs: Date.now() - startedAt,
      });
      const applied = applyJobStatusTransition({
        jobId,
        userId,
        to: "completed",
        attemptCount: nextAttempt,
        result: {
          ...commander.result!,
          ...(commander.runId ? { commanderRunId: commander.runId } : {}),
        },
        completionGate: mapped.completionGate,
        metadataPatch: {
          notificationCreated: Boolean(
            commander.persistence?.notificationCreated,
          ),
          projectId: commander.persistence?.projectId ?? null,
        },
      });
      if (!applied.ok) {
        // Gate rejected completed — surface as failed with the gate code.
        const failed = applyJobStatusTransition({
          jobId,
          userId,
          to: "failed",
          errorCode: applied.code,
          internalError: applied.message,
          attemptCount: nextAttempt,
          result: commander.result ?? null,
        });
        return failed.ok && failed.job
          ? failed.job
          : (getWorkJob(jobId, userId) ?? existing);
      }
      return applied.job;
    }

    if (mapped.to === "cancelled") {
      const applied = applyJobStatusTransition({
        jobId,
        userId,
        to: "cancelled",
        attemptCount: nextAttempt,
        result: commander.result ?? null,
      });
      return applied.ok && applied.job
        ? applied.job
        : (getWorkJob(jobId, userId) ?? existing);
    }

    // failed
    const errorCode =
      mapped.errorCode ??
      classifyWorkJobError(
        commander.visionGate?.message ?? commander.report?.summary ?? "failed",
      );
    recordReliabilityEvent("work_job", "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorMessage: mapped.internalError ?? errorCode,
    });
    const applied = applyJobStatusTransition({
      jobId,
      userId,
      to: "failed",
      errorCode,
      internalError:
        mapped.internalError ??
        commander.visionGate?.message ??
        commander.report?.summary ??
        "failed",
      userMessage: userMessageForJobError(
        errorCode,
        toHumanReliabilityMessage(
          commander.visionGate?.message ??
            commander.report?.summary ??
            "failed",
        ),
      ),
      attemptCount: nextAttempt,
      result: commander.result ?? null,
    });
    return applied.ok && applied.job
      ? applied.job
      : (getWorkJob(jobId, userId) ?? existing);
  } catch (error) {
    const message = toHumanReliabilityMessage(error);
    const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
    const errorCode = isTimeout
      ? ("TIMEOUT" as const)
      : classifyWorkJobError(message);
    recordReliabilityEvent("work_job", isTimeout ? "timeout" : "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    if (isTimeout) recordReliabilityEvent("timeout", "timeout");

    const applied = applyJobStatusTransition({
      jobId,
      userId,
      to: isTimeout ? "timed_out" : "failed",
      errorCode,
      internalError: message.slice(0, 500),
      userMessage: userMessageForJobError(errorCode, message),
      attemptCount: nextAttempt,
      metadataPatch: isTimeout
        ? { timeoutReason: message.slice(0, 240) }
        : undefined,
    });
    return applied.ok && applied.job
      ? applied.job
      : (getWorkJob(jobId, userId) ?? existing);
  }
}
