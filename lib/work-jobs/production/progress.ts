import type { WorkJobProgress, WorkJobRecord } from "@/lib/work-jobs/store";
import {
  labelForJobStage,
  normalizeJobStage,
  progressPercentForStage,
} from "@/lib/queue/state-machine";

/**
 * User-facing progress payload for poll API / UI.
 */
export function buildWorkJobProgress(job: WorkJobRecord): WorkJobProgress {
  const stage = normalizeJobStage(job.stage ?? job.status);
  const waitingForInput =
    stage === "needs_input" || job.status === "awaiting_confirmation";
  const retrying = stage === "retrying" || job.status === "retrying";
  return {
    stage,
    label: job.currentStep ?? labelForJobStage(stage),
    percent: job.progressPercent ?? progressPercentForStage(stage),
    estimatedRemainingMs:
      job.estimatedRemainingMs ??
      (stage === "completed" || stage === "failed" || stage === "cancelled"
        ? 0
        : null),
    retrying,
    waitingForInput,
    failureReason: job.error,
  };
}

export function buildWorkJobPublicView(job: WorkJobRecord) {
  const progress = buildWorkJobProgress(job);
  return {
    jobId: job.id,
    status: job.status,
    stage: progress.stage,
    progress,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    retryCount: Math.max(0, job.attemptCount - 1),
    workerId: job.workerId ?? null,
    requestId: job.requestId ?? job.id,
    diagnosticId: job.diagnosticId ?? null,
    artifactId: job.artifactId ?? null,
    statusHistory: job.statusHistory ?? [],
    audit: job.audit
      ? {
          requestId: job.audit.requestId,
          jobId: job.audit.jobId,
          artifactId: job.audit.artifactId,
          retryCount: job.audit.retryCount,
          workerId: job.audit.workerId,
          durationMs: job.audit.durationMs,
          diagnosticId: job.audit.diagnosticId,
          statusHistory: job.audit.statusHistory,
        }
      : null,
    error: job.error,
    nextRetryAt: job.nextRetryAt ?? null,
    message: progressMessage(progress, job),
  };
}

function progressMessage(
  progress: WorkJobProgress,
  job: WorkJobRecord,
): string {
  if (progress.stage === "completed") return "すべて完了しました。";
  if (progress.stage === "failed") {
    return progress.failureReason ?? "確認が必要です。";
  }
  if (progress.stage === "cancelled") return "キャンセルされました。";
  if (progress.waitingForInput) return "確認が必要です。";
  if (progress.retrying) {
    return `再試行中です（${job.attemptCount}/${job.maxAttempts}）。`;
  }
  const eta =
    progress.estimatedRemainingMs != null
      ? ` 残りおよそ${Math.max(1, Math.round(progress.estimatedRemainingMs / 1000))}秒。`
      : "";
  return `${progress.label}（${progress.percent}%）。${eta}`.trim();
}
