import "server-only";

import { runCommanderRequest } from "@/lib/commander/service";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

import { withPropagatedJobId } from "./job-id";
import {
  getWorkJob,
  saveWorkJob,
  touchWorkJob,
  type WorkJobRecord,
} from "./store";

/**
 * Just over route maxDuration (300s). If a serverless after() is killed,
 * the job stays `running` with an old updatedAt — reclaim after this window.
 */
export const WORK_JOB_STALE_RUNNING_MS = 310_000;

export function isStaleWorkJobRunning(
  job: WorkJobRecord,
  nowMs = Date.now(),
): boolean {
  if (job.status !== "running") return false;
  const updatedMs = new Date(job.updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return nowMs - updatedMs > WORK_JOB_STALE_RUNNING_MS;
}

export function isWorkJobTerminal(status: WorkJobRecord["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "awaiting_confirmation"
  );
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

/**
 * Execute a queued work job on the server (not in the browser).
 * Retries transient failures up to maxAttempts with backoff.
 * Idempotent: completed jobs are not re-executed.
 * Stale `running` jobs are reclaimed so work never stays 処理中 forever.
 *
 * POST 202 / status queued|accepted = 受付成功 only.
 * status completed = AI + artifacts + Supabase + downloadable all succeeded.
 */
export async function executeWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  // Duplicate execution forbidden for terminal / confirmation states.
  if (
    existing.status === "completed" ||
    existing.status === "awaiting_confirmation"
  ) {
    return existing;
  }

  // Fresh running lease — another worker is actively processing.
  if (existing.status === "running" && !isStaleWorkJobRunning(existing)) {
    return existing;
  }

  // Stale running past maxAttempts → force failed (never leave 処理中).
  if (
    existing.status === "running" &&
    isStaleWorkJobRunning(existing) &&
    existing.attemptCount >= existing.maxAttempts
  ) {
    return saveWorkJob({
      ...existing,
      status: "failed",
      error:
        "処理が長時間停止したため失敗として記録しました。もう一度送ってください。",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }

  const startedAt = Date.now();
  const metadataWithJobId = withPropagatedJobId(existing.metadata, jobId);

  await saveWorkJob({
    ...existing,
    status: "running",
    metadata: metadataWithJobId,
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
        // Heartbeat so long runs are not mistaken for stale hangs.
        const current = getWorkJob(jobId, userId);
        if (current?.status === "running") {
          await touchWorkJob({
            ...current,
            metadata: withPropagatedJobId(current.metadata, jobId),
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

    // Merge vision metadata + ID links (commanderRunId ≠ workJobId).
    const projectIdFromCommander =
      commander.persistence?.projectId ??
      (commander.runId ? `commander-${commander.runId}` : null);
    const mergedMetadata = withPropagatedJobId(
      {
        ...metadataWithJobId,
        ...(commander.visionGate?.diagnosticId
          ? { visionDiagnosticId: commander.visionGate.diagnosticId }
          : {}),
        ...(commander.runId ? { commanderRunId: commander.runId } : {}),
        ...(projectIdFromCommander
          ? { projectId: projectIdFromCommander }
          : {}),
        ...(commander.persistence?.wordErrorCode
          ? { wordErrorCode: commander.persistence.wordErrorCode }
          : {}),
        ...(commander.result?.generationFailure
          ? { generationFailure: commander.result.generationFailure }
          : {}),
      },
      jobId,
    );

    if (commander.status === "awaiting_confirmation") {
      return saveWorkJob({
        ...existing,
        status: "awaiting_confirmation",
        metadata: mergedMetadata,
        attemptCount: Math.max(existing.attemptCount + 1, 1),
        result: commander.result ?? null,
        error: null,
        updatedAt: new Date().toISOString(),
      });
    }

    // Vision / attachment hard failures must surface as failed jobs — never "completed".
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
        metadata: {
          failedStage: commander.visionGate.failedStage ?? null,
          failedStageLabel: commander.visionGate.failedStageLabel ?? null,
          lastSuccessHint: "vision_prior_stage",
          blockedStage: commander.visionGate.failedStage ?? "vision_response",
          cause: commander.visionGate.cause ?? null,
          vercelRequestId: commander.visionGate.vercelRequestId ?? null,
          openaiRequestId: visionOpenAi?.requestId ?? null,
          openaiHttpStatus: visionOpenAi?.httpStatus ?? null,
          openaiErrorType: visionOpenAi?.type ?? null,
          openaiErrorCode: visionOpenAi?.code ?? null,
          openaiErrorMessage: visionOpenAi?.message ?? null,
          openaiErrorBody: visionOpenAi?.rawErrorBody ?? null,
          tracking: {
            diagnosticId: commander.visionGate.diagnosticId ?? null,
            supabaseDomain: "atlasVisionDiagnostics",
            vercelRequestId: commander.visionGate.vercelRequestId ?? null,
            openaiRequestId: visionOpenAi?.requestId ?? null,
            jobId,
          },
        },
      });
      return saveWorkJob({
        ...existing,
        status: "failed",
        metadata: {
          ...mergedMetadata,
          failureDiagnostic: {
            jobId,
            diagnosticId: commander.visionGate.diagnosticId ?? null,
            failedStage: commander.visionGate.failedStage ?? null,
            developerCode: commander.visionGate.developerCode ?? null,
            cause: commander.visionGate.cause ?? null,
            vercelRequestId: commander.visionGate.vercelRequestId ?? null,
            openai: visionOpenAi,
            safeMessage:
              visionOpenAi?.message ??
              commander.visionGate.cause ??
              commander.visionGate.message,
          },
        },
        attemptCount: existing.attemptCount + 1,
        error:
          visionOpenAi?.message ??
          commander.visionGate.cause ??
          commander.visionGate.message,
        visionGate: commander.visionGate,
        result: null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    if (commander.status === "failed" || !commander.result) {
      const failedStage =
        commander.visionGate?.failedStage ??
        (commander.result as { stepError?: { step?: string } } | null | undefined)
          ?.stepError?.step ??
        "worker";
      const safeMessage = toHumanReliabilityMessage(
        commander.visionGate?.message ??
          commander.report?.summary ??
          "failed",
      );
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorCode:
          commander.visionGate?.developerCode ?? "commander_failed",
        errorMessage: safeMessage,
        message: safeMessage,
        jobId,
        diagnosticId:
          commander.visionGate?.diagnosticId ??
          (typeof mergedMetadata.visionDiagnosticId === "string"
            ? mergedMetadata.visionDiagnosticId
            : null),
        userId,
        stage: failedStage,
        severity: "error",
        metadata: {
          commanderStatus: commander.status,
          reportSummary: commander.report?.summary?.slice(0, 300) ?? null,
          attempts: commander.attempts?.length ?? commander.report?.attempts ?? null,
          failedStage,
          developerCode: commander.visionGate?.developerCode ?? null,
          lastSuccessHint: "commander_prior_stage",
          blockedStage: failedStage,
          persistence: commander.persistence
            ? {
                projectPersisted: commander.persistence.projectPersisted,
                wordRequired: commander.persistence.wordRequired,
                wordCompletionVerified:
                  commander.persistence.wordCompletionVerified,
                wordErrorCode: commander.persistence.wordErrorCode ?? null,
              }
            : null,
        },
      });
      return saveWorkJob({
        ...existing,
        status: "failed",
        metadata: {
          ...mergedMetadata,
          failureDiagnostic: {
            jobId,
            diagnosticId:
              commander.visionGate?.diagnosticId ??
              (typeof mergedMetadata.visionDiagnosticId === "string"
                ? mergedMetadata.visionDiagnosticId
                : null),
            failedStage,
            developerCode: commander.visionGate?.developerCode ?? null,
            safeMessage,
          },
        },
        attemptCount: existing.attemptCount + 1,
        error: safeMessage,
        visionGate: commander.visionGate ?? existing.visionGate ?? null,
        result: commander.result ?? null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    const gate = evaluateCompletionGate({
      job: { ...existing, metadata: mergedMetadata },
      commander,
    });
    if (!gate.ok) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorCode: "completion_gate_failed",
        errorMessage: gate.error,
        message: gate.error,
        jobId,
        diagnosticId:
          typeof mergedMetadata.visionDiagnosticId === "string"
            ? mergedMetadata.visionDiagnosticId
            : null,
        userId,
        stage: "completion_gate",
        severity: "error",
        metadata: {
          failedStage: "completion_gate",
          blockedStage: "completed",
          lastSuccessHint: "commander_result",
          persistence: commander.persistence
            ? {
                projectPersisted: commander.persistence.projectPersisted,
                wordRequired: commander.persistence.wordRequired,
                wordCompletionVerified:
                  commander.persistence.wordCompletionVerified,
                wordErrorCode: commander.persistence.wordErrorCode ?? null,
              }
            : null,
          downloadableCount: (commander.result.fileDeliverables ?? []).filter(
            (f) => Boolean(f.downloadUrl?.includes(`/api/deliverables/${f.id}`)),
          ).length,
        },
      });
      return saveWorkJob({
        ...existing,
        status: "failed",
        metadata: {
          ...mergedMetadata,
          failureDiagnostic: {
            jobId,
            failedStage: "completion_gate",
            developerCode: "completion_gate_failed",
            safeMessage: toHumanReliabilityMessage(gate.error),
          },
        },
        attemptCount: existing.attemptCount + 1,
        error: toHumanReliabilityMessage(gate.error),
        visionGate: commander.visionGate ?? existing.visionGate ?? null,
        result: commander.result ?? null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    recordReliabilityEvent("work_job", "success", 1, {
      durationMs: Date.now() - startedAt,
      jobId,
      userId,
      stage: "completed",
      severity: "info",
    });

    // Durable save is part of completed — saveWorkJob throws if Supabase fails.
    return saveWorkJob({
      ...existing,
      status: "completed",
      metadata: mergedMetadata,
      attemptCount: existing.attemptCount + 1,
      result: {
        ...commander.result,
        ...(commander.runId ? { commanderRunId: commander.runId } : {}),
      },
      error: null,
      visionGate: null,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "work_job_durable_persist_failed"
        ? "ジョブ状態をSupabaseへ保存できませんでした"
        : toHumanReliabilityMessage(error);
    const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
    recordReliabilityEvent("work_job", isTimeout ? "timeout" : "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorCode: isTimeout ? "timeout" : "work_job_exception",
      errorMessage: message,
      message,
      jobId,
      userId,
      stage: isTimeout ? "timeout" : "work_job",
      severity: "error",
      metadata: {
        failedStage: isTimeout ? "timeout" : "work_job",
        blockedStage: "completed",
      },
    });
    if (isTimeout) recordReliabilityEvent("timeout", "timeout");

    // Best-effort failed persist — if this also fails, rethrow.
    try {
      return await saveWorkJob({
        ...existing,
        status: "failed",
        metadata: withPropagatedJobId(existing.metadata, jobId),
        attemptCount: existing.attemptCount + 1,
        error: message,
        visionGate: existing.visionGate ?? null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (persistError) {
      console.error("[work-jobs] failed to persist failed status", persistError);
      throw error;
    }
  }
}
