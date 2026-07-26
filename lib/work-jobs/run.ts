import "server-only";

import { runCommanderRequest } from "@/lib/commander/service";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

import { getWorkJob, saveWorkJob, type WorkJobRecord } from "./store";

/**
 * Execute a queued work job on the server (not in the browser).
 * Retries transient failures up to maxAttempts with backoff.
 * Idempotent: completed / running jobs are not re-executed.
 */
export async function executeWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  // Duplicate execution forbidden.
  if (existing.status === "completed" || existing.status === "awaiting_confirmation") {
    return existing;
  }
  if (existing.status === "running") {
    return existing;
  }

  const startedAt = Date.now();
  saveWorkJob({
    ...existing,
    status: "running",
    attemptCount: existing.attemptCount + 1,
    updatedAt: new Date().toISOString(),
  });

  try {
    const commander = await withRetry(
      async (attempt) => {
        if (attempt > 1) {
          recordReliabilityEvent("retry", "retry");
          recordReliabilityEvent("work_job", "retry");
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

    if (commander.status === "awaiting_confirmation") {
      return saveWorkJob({
        ...existing,
        status: "awaiting_confirmation",
        attemptCount: Math.max(existing.attemptCount + 1, 1),
        result: commander.result ?? null,
        error: null,
        updatedAt: new Date().toISOString(),
      });
    }

    // Vision / attachment hard failures must surface as failed jobs — never "completed".
    if (commander.visionGate && !commander.visionGate.analysisSuccess) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorMessage: commander.visionGate.message,
      });
      return saveWorkJob({
        ...existing,
        status: "failed",
        attemptCount: existing.attemptCount + 1,
        error: commander.visionGate.message,
        result: null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    if (commander.status === "failed" || !commander.result) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorMessage: commander.report?.summary ?? "failed",
      });
      return saveWorkJob({
        ...existing,
        status: "failed",
        attemptCount: existing.attemptCount + 1,
        error: toHumanReliabilityMessage(
          commander.visionGate?.message ??
            commander.report?.summary ??
            "failed",
        ),
        result: commander.result ?? null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    recordReliabilityEvent("work_job", "success", 1, {
      durationMs: Date.now() - startedAt,
    });
    return saveWorkJob({
      ...existing,
      status: "completed",
      attemptCount: existing.attemptCount + 1,
      result: {
        ...commander.result,
        ...(commander.runId ? { commanderRunId: commander.runId } : {}),
      },
      error: null,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = toHumanReliabilityMessage(error);
    const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
    recordReliabilityEvent("work_job", isTimeout ? "timeout" : "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    if (isTimeout) recordReliabilityEvent("timeout", "timeout");
    return saveWorkJob({
      ...existing,
      status: "failed",
      attemptCount: existing.attemptCount + 1,
      error: message,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }
}
