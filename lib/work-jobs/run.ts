import "server-only";

import { runCommanderRequest } from "@/lib/commander/service";
import { newWorkerId, decideLeaseClaim } from "@/lib/queue/claim";
import {
  appendBackoffRecord,
  computeBackoffWithJitter,
} from "@/lib/queue/backoff";
import { createJobAuditTrail, mergeJobAudit } from "@/lib/queue/audit";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { classifyRetryError } from "@/lib/jobs/retry-classifier";

import { withPropagatedJobId } from "./job-id";
import { applyWorkJobStageTransition } from "./production/transition";
import { emitJobLifecycleNotification } from "./production/notify";
import {
  getWorkJob,
  isWorkJobInProgressStatus,
  isWorkJobTerminalStatus,
  saveWorkJob,
  touchWorkJob,
  type WorkJobRecord,
} from "./store";

/**
 * Just over route maxDuration (300s). If a serverless after() is killed,
 * the job stays in-progress with an old updatedAt — reclaim after this window.
 */
export const WORK_JOB_STALE_RUNNING_MS = 310_000;

export function isStaleWorkJobRunning(
  job: WorkJobRecord,
  nowMs = Date.now(),
): boolean {
  if (!isWorkJobInProgressStatus(job.status) && job.status !== "running") {
    return false;
  }
  const updatedMs = new Date(job.updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return nowMs - updatedMs > WORK_JOB_STALE_RUNNING_MS;
}

export function isWorkJobTerminal(status: WorkJobRecord["status"]): boolean {
  return isWorkJobTerminalStatus(status);
}

function readAttachmentIds(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): string[] {
  const raw = metadata?.attachmentIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * completed requires (when images attached): AI vision ok, deliverables downloadable,
 * project/artifact persistence. Always requires commander success + durable Supabase
 * job save (enforced by saveWorkJob). Clerk/AI/artifact failures never become completed.
 */
function evaluateCompletionGate(input: {
  job: WorkJobRecord;
  commander: Awaited<ReturnType<typeof runCommanderRequest>>;
}): { ok: true } | { ok: false; error: string } {
  const { job, commander } = input;
  const attachmentIds = readAttachmentIds(job.metadata);
  const hasImages = attachmentIds.length > 0;

  if (commander.visionGate && !commander.visionGate.analysisSuccess) {
    return {
      ok: false,
      error: commander.visionGate.message || "画像解析に失敗しました",
    };
  }

  if (commander.status === "failed" || !commander.result) {
    return {
      ok: false,
      error:
        commander.visionGate?.message ??
        commander.report?.summary ??
        "仕事の実行に失敗しました",
    };
  }

  const persistence = commander.persistence;
  const files = commander.result.fileDeliverables ?? [];
  const hasDownloadable = files.some((f) =>
    Boolean(f.downloadUrl?.includes(`/api/deliverables/${f.id}`)),
  );

  if (persistence?.wordRequired && !persistence.wordCompletionVerified && !hasDownloadable) {
    return {
      ok: false,
      error:
        persistence.wordErrorCode
          ? `Word成果物の保存に失敗しました（${persistence.wordErrorCode}）`
          : "Word成果物を確認できませんでした",
    };
  }

  if (hasImages) {
    if (!persistence) {
      return {
        ok: false,
        error: "成果物の保存結果を確認できませんでした",
      };
    }

    if (
      !persistence.projectPersisted &&
      !persistence.wordCompletionVerified &&
      !hasDownloadable
    ) {
      return {
        ok: false,
        error: "成果物をSupabaseへ保存できませんでした",
      };
    }

    if (!hasDownloadable && !persistence.wordCompletionVerified) {
      return {
        ok: false,
        error: "画像解析後の成果物が保存されていないため完了にできません",
      };
    }
  }

  return { ok: true };
}

async function persistStage(
  job: WorkJobRecord,
  stage: Parameters<typeof applyWorkJobStageTransition>[1],
  opts?: Parameters<typeof applyWorkJobStageTransition>[2],
  durable = true,
): Promise<WorkJobRecord> {
  const next = applyWorkJobStageTransition(job, stage, opts);
  if (durable) return saveWorkJob(next);
  return touchWorkJob(next);
}

/**
 * Execute a queued work job on the server (not in the browser).
 * Retries transient failures up to maxAttempts with backoff + jitter.
 * Idempotent: completed jobs are not re-executed.
 * Stale in-progress jobs are reclaimed so work never stays 処理中 forever.
 */
export async function executeWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  if (
    existing.status === "completed" ||
    existing.status === "awaiting_confirmation" ||
    existing.status === "needs_input" ||
    existing.status === "cancelled"
  ) {
    return existing;
  }

  const workerId = newWorkerId();
  // Terminal statuses already returned above. `failed` may restart.
  const lease = decideLeaseClaim({
    status: existing.status,
    updatedAt: existing.updatedAt,
    attemptCount: existing.attemptCount,
    maxAttempts: existing.maxAttempts,
    workerId: existing.workerId,
    newWorkerId: workerId,
    isInProgress: isWorkJobInProgressStatus(existing.status),
    isTerminal: false,
    staleMs: WORK_JOB_STALE_RUNNING_MS,
  });
  if (lease.action === "skip_fresh_lease") {
    return existing;
  }
  if (lease.action === "force_failed") {
    const failed = applyWorkJobStageTransition(existing, "failed", {
      reason: lease.reason,
      workerId,
      error:
        "処理が長時間停止したため失敗として記録しました。もう一度送ってください。",
      estimatedRemainingMs: 0,
    });
    const saved = await saveWorkJob(failed);
    emitJobLifecycleNotification({
      job: saved,
      event: "failed",
      message: saved.error,
    });
    return saved;
  }

  const startedAt = Date.now();
  const metadataWithJobId = withPropagatedJobId(existing.metadata, jobId);
  const audit = mergeJobAudit(
    existing.audit ??
      createJobAuditTrail({
        jobId,
        requestId: existing.requestId ?? jobId,
        workerId,
      }),
    {
      workerId,
      requestId: existing.requestId ?? jobId,
      retryCount: existing.attemptCount,
    },
  );

  // Restart / reclaim always enters via retrying (except fresh queued).
  let seed: WorkJobRecord = {
    ...existing,
    metadata: metadataWithJobId,
    attemptCount: existing.attemptCount + 1,
    workerId,
    requestId: existing.requestId ?? jobId,
    audit,
    nextRetryAt: null,
    completedAt: null,
    error: null,
  };
  if (
    seed.status === "failed" ||
    (isWorkJobInProgressStatus(seed.status) && seed.status !== "retrying")
  ) {
    seed = applyWorkJobStageTransition(seed, "retrying", {
      reason:
        lease.action === "reclaim" ? lease.reason : "restart_failed_job",
      workerId,
    });
  }

  let current = await persistStage(seed, "validating", {
    reason:
      lease.action === "reclaim"
        ? lease.reason
        : seed.status === "retrying"
          ? "restart"
          : "claim",
    workerId,
  });

  emitJobLifecycleNotification({
    job: current,
    event: current.attemptCount > 1 ? "retry" : "start",
  });

  try {
    current = await persistStage(current, "preprocessing", { workerId }, false);
    current = await persistStage(current, "analyzing", { workerId }, false);

    const commander = await withRetry(
      async (attempt) => {
        if (attempt > 1) {
          recordReliabilityEvent("retry", "retry");
          recordReliabilityEvent("work_job", "retry");
          const backoff = computeBackoffWithJitter({ attempt: attempt - 1 });
          current = touchWorkJob({
            ...applyWorkJobStageTransition(current, "retrying", {
              reason: `immediate_retry_${attempt}`,
              workerId,
            }),
            audit: mergeJobAudit(current.audit, {
              backoffRecords: appendBackoffRecord(
                current.audit?.backoffRecords,
                backoff.record,
              ),
              retryCount: attempt - 1,
            }),
            nextRetryAt: backoff.nextAt,
          });
          emitJobLifecycleNotification({
            job: current,
            event: "retry",
            message: `一時的な問題のため再試行しています（${attempt}回目）`,
          });
        }
        const latest = getWorkJob(jobId, userId);
        if (latest && isWorkJobInProgressStatus(latest.status)) {
          current = touchWorkJob({
            ...applyWorkJobStageTransition(
              { ...latest, stage: latest.stage ?? "analyzing" },
              "generating",
              { workerId },
            ),
            updatedAt: new Date().toISOString(),
          });
        }
        return runCommanderRequest({
          userId,
          request: {
            assignment: existing.assignment,
            mode: "execute",
            metadata: {
              requestUi: "secretary_zero_friction_v1",
              ...withPropagatedJobId(
                { ...(existing.metadata ?? {}), ...(metadataWithJobId ?? {}) },
                jobId,
              ),
              idempotencyKey: existing.idempotencyKey,
            },
          },
        });
      },
      { maxAttempts: existing.maxAttempts },
    );

    const mergedMetadata = withPropagatedJobId(
      {
        ...metadataWithJobId,
        ...(commander.visionGate?.diagnosticId
          ? { visionDiagnosticId: commander.visionGate.diagnosticId }
          : {}),
      },
      jobId,
    );

    if (commander.status === "awaiting_confirmation") {
      current = await persistStage(
        {
          ...current,
          metadata: mergedMetadata,
          result: commander.result ?? null,
          diagnosticId: commander.visionGate?.diagnosticId ?? current.diagnosticId,
        },
        "needs_input",
        { reason: "awaiting_confirmation", workerId, error: null },
      );
      emitJobLifecycleNotification({
        job: current,
        event: "needs_input",
      });
      return current;
    }

    if (commander.visionGate && !commander.visionGate.analysisSuccess) {
      const visionOpenAi = commander.visionGate.openai ?? null;
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorCode:
          visionOpenAi?.code ??
          commander.visionGate.developerCode ??
          "vision_failed",
        errorMessage:
          visionOpenAi?.message ??
          commander.visionGate.cause ??
          commander.visionGate.message,
        message:
          visionOpenAi?.message ??
          commander.visionGate.cause ??
          commander.visionGate.message,
        jobId,
        diagnosticId: commander.visionGate.diagnosticId ?? null,
        userId,
        stage: commander.visionGate.failedStage ?? "vision_response",
        severity: "error",
      });
      current = await persistStage(
        {
          ...current,
          metadata: {
            ...mergedMetadata,
            failureDiagnostic: {
              jobId,
              diagnosticId: commander.visionGate.diagnosticId ?? null,
              failedStage: commander.visionGate.failedStage ?? null,
            },
          },
          visionGate: commander.visionGate,
          result: null,
          diagnosticId: commander.visionGate.diagnosticId ?? null,
        },
        "failed",
        {
          workerId,
          error:
            visionOpenAi?.message ??
            commander.visionGate.cause ??
            commander.visionGate.message,
        },
      );
      emitJobLifecycleNotification({
        job: current,
        event: "failed",
        message: current.error,
      });
      return current;
    }

    if (commander.status === "failed" || !commander.result) {
      const safeMessage = toHumanReliabilityMessage(
        commander.visionGate?.message ??
          commander.report?.summary ??
          "failed",
      );
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorCode: commander.visionGate?.developerCode ?? "commander_failed",
        errorMessage: safeMessage,
        message: safeMessage,
        jobId,
        userId,
        stage: "worker",
        severity: "error",
      });
      current = await persistStage(
        {
          ...current,
          metadata: mergedMetadata,
          visionGate: commander.visionGate ?? current.visionGate ?? null,
          result: commander.result ?? null,
        },
        "failed",
        { workerId, error: safeMessage },
      );
      emitJobLifecycleNotification({
        job: current,
        event: "failed",
        message: safeMessage,
      });
      return current;
    }

    current = await persistStage(
      { ...current, metadata: mergedMetadata },
      "converting",
      { workerId },
      false,
    );
    current = await persistStage(current, "uploading", { workerId }, false);
    current = await persistStage(current, "saving", { workerId }, false);

    const gate = evaluateCompletionGate({
      job: { ...current, metadata: mergedMetadata },
      commander,
    });
    if (!gate.ok) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorCode: "completion_gate_failed",
        errorMessage: gate.error,
        message: gate.error,
        jobId,
        userId,
        stage: "completion_gate",
        severity: "error",
      });
      current = await persistStage(
        {
          ...current,
          metadata: mergedMetadata,
          result: commander.result ?? null,
          visionGate: commander.visionGate ?? current.visionGate ?? null,
        },
        "failed",
        { workerId, error: toHumanReliabilityMessage(gate.error) },
      );
      emitJobLifecycleNotification({
        job: current,
        event: "failed",
        message: current.error,
      });
      return current;
    }

    const artifactId =
      commander.result.fileDeliverables?.[0]?.id ??
      current.artifactId ??
      null;

    current = await persistStage(
      {
        ...current,
        metadata: mergedMetadata,
        result: {
          ...commander.result,
          ...(commander.runId ? { commanderRunId: commander.runId } : {}),
        },
        artifactId,
        visionGate: null,
        audit: mergeJobAudit(current.audit, {
          artifactId,
          durationMs: Date.now() - startedAt,
        }),
      },
      "notifying",
      { workerId },
      false,
    );

    emitJobLifecycleNotification({
      job: current,
      event: "progress",
      message: "完了通知を準備しています",
    });

    recordReliabilityEvent("work_job", "success", 1, {
      durationMs: Date.now() - startedAt,
      jobId,
      userId,
      stage: "completed",
      severity: "info",
    });

    current = await persistStage(current, "completed", {
      workerId,
      error: null,
      estimatedRemainingMs: 0,
    });

    // completed notification is typically emitted by Commander; emit only if missing path
    emitJobLifecycleNotification({
      job: current,
      event: "completed",
    });

    return current;
  } catch (error) {
    const message =
      error instanceof Error && error.message === "work_job_durable_persist_failed"
        ? "ジョブ状態をSupabaseへ保存できませんでした"
        : toHumanReliabilityMessage(error);
    const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
    const retryable = classifyRetryError(error) === "retryable";

    recordReliabilityEvent("work_job", isTimeout ? "timeout" : "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorCode: isTimeout ? "timeout" : "work_job_exception",
      errorMessage: message,
      message,
      jobId,
      userId,
      stage: isTimeout ? "timeout" : "work_job",
      severity: "error",
    });
    if (isTimeout) recordReliabilityEvent("timeout", "timeout");

    try {
      const latest = getWorkJob(jobId, userId) ?? current;
      if (
        retryable &&
        latest.attemptCount < latest.maxAttempts &&
        latest.status !== "cancelled"
      ) {
        const backoff = computeBackoffWithJitter({
          attempt: latest.attemptCount,
        });
        const retrying = applyWorkJobStageTransition(latest, "retrying", {
          workerId,
          reason: "retryable_exception",
          error: message,
        });
        const saved = await saveWorkJob({
          ...retrying,
          nextRetryAt: backoff.nextAt,
          audit: mergeJobAudit(retrying.audit, {
            backoffRecords: appendBackoffRecord(
              retrying.audit?.backoffRecords,
              { ...backoff.record, reason: message },
            ),
            retryCount: latest.attemptCount,
            durationMs: Date.now() - startedAt,
          }),
        });
        emitJobLifecycleNotification({
          job: saved,
          event: "retry",
          message,
        });
        return saved;
      }

      const failed = applyWorkJobStageTransition(latest, "failed", {
        workerId,
        error: message,
      });
      const saved = await saveWorkJob({
        ...failed,
        audit: mergeJobAudit(failed.audit, {
          durationMs: Date.now() - startedAt,
        }),
      });
      emitJobLifecycleNotification({
        job: saved,
        event: "failed",
        message,
      });
      return saved;
    } catch (persistError) {
      console.error("[work-jobs] failed to persist failed status", persistError);
      throw error;
    }
  }
}
