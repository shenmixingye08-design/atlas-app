import "server-only";

import {
  appendStatusHistory,
  canTransitionJobStage,
  IllegalJobTransitionError,
  labelForJobStage,
  progressPercentForStage,
  type JobPipelineStage,
} from "@/lib/queue/state-machine";
import { createJobAuditTrail, mergeJobAudit } from "@/lib/queue/audit";
import type { WorkJobRecord, WorkJobStatus } from "@/lib/work-jobs/store";

function stageToStatus(stage: JobPipelineStage): WorkJobStatus {
  if (stage === "awaiting_confirmation") return "needs_input";
  return stage;
}

/**
 * Apply a legal stage transition onto a work job record (pure).
 */
export function applyWorkJobStageTransition(
  job: WorkJobRecord,
  to: JobPipelineStage,
  input?: {
    reason?: string | null;
    workerId?: string | null;
    error?: string | null;
    estimatedRemainingMs?: number | null;
    nowIso?: string;
  },
): WorkJobRecord {
  const from = (job.stage ?? job.status) as JobPipelineStage;
  if (!canTransitionJobStage(from, to)) {
    throw new IllegalJobTransitionError(from, to);
  }
  const now = input?.nowIso ?? new Date().toISOString();
  const workerId = input?.workerId ?? job.workerId ?? null;
  const history = appendStatusHistory(job.statusHistory, {
    from,
    to,
    at: now,
    reason: input?.reason ?? null,
    workerId,
  });
  const audit = mergeJobAudit(job.audit ?? createJobAuditTrail({ jobId: job.id }), {
    jobId: job.id,
    requestId: job.requestId ?? job.id,
    workerId,
    retryCount: job.attemptCount,
    statusHistory: history,
    lastStage: to,
    diagnosticId: job.diagnosticId ?? job.audit?.diagnosticId ?? null,
  });

  const terminal =
    to === "completed" ||
    to === "failed" ||
    to === "cancelled" ||
    to === "needs_input";

  return {
    ...job,
    status: stageToStatus(to),
    stage: to,
    progressPercent: progressPercentForStage(to),
    currentStep: labelForJobStage(to),
    estimatedRemainingMs:
      input?.estimatedRemainingMs ??
      (terminal ? 0 : estimateRemainingMs(to)),
    workerId,
    error: input?.error !== undefined ? input.error : job.error,
    statusHistory: history,
    audit,
    updatedAt: now,
    completedAt: terminal
      ? (job.completedAt ?? now)
      : to === "retrying"
        ? null
        : job.completedAt,
  };
}

function estimateRemainingMs(stage: JobPipelineStage): number | null {
  const map: Partial<Record<JobPipelineStage, number>> = {
    queued: 90_000,
    validating: 80_000,
    preprocessing: 70_000,
    analyzing: 55_000,
    generating: 40_000,
    converting: 25_000,
    uploading: 18_000,
    saving: 12_000,
    notifying: 5_000,
    retrying: 60_000,
    running: 60_000,
  };
  return map[stage] ?? null;
}
