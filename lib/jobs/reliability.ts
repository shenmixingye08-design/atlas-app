/**
 * Durable job state for automations / scheduled work.
 * Persists to Supabase atlas_automation_jobs (memory fallback in dev/tests).
 */

import {
  classifyRetryError,
  computeNextRetryAt,
  MAX_JOB_RETRIES,
} from "./retry-classifier";
import {
  getJobRecord as getStoredJobRecord,
  upsertJobRecord as persistJobRecord,
} from "./job-store";
import { buildStepEvidence } from "./step-labels";
import {
  assertJobTransition,
  recordJobTransition,
} from "./transitions";
import type { JobPushStatus, JobRecord, JobStatus } from "./types";

function trackTransition(input: {
  jobId: string;
  userId: string;
  from: JobStatus | null | undefined;
  to: JobStatus;
  reason?: string | null;
  retryCount?: number;
  failedStage?: string | null;
  diagnosticId?: string | null;
  requestId?: string | null;
  changedBy?: string;
}): void {
  assertJobTransition(input.from, input.to, { jobId: input.jobId });
  recordJobTransition({
    jobId: input.jobId,
    userId: input.userId,
    previousStatus: input.from ?? null,
    nextStatus: input.to,
    changedAt: new Date().toISOString(),
    changedBy: input.changedBy ?? "system",
    reason: input.reason ?? null,
    retryCount: input.retryCount ?? 0,
    failedStage: input.failedStage ?? null,
    diagnosticId: input.diagnosticId ?? null,
    requestId: input.requestId ?? null,
  });
}

export type { JobStatus, JobPushStatus, JobRecord } from "./types";
export { JOB_HANG_TIMEOUT_MS, listDueRetries } from "./job-store";

export async function getJobRecord(
  jobId: string,
  userId: string,
): Promise<JobRecord | null> {
  return getStoredJobRecord(jobId, userId);
}

export async function upsertJobRecord(record: JobRecord): Promise<JobRecord> {
  return persistJobRecord(record);
}

export async function markJobRunning(input: {
  jobId: string;
  userId: string;
  automationId?: string | null;
  step?: string | null;
}): Promise<JobRecord> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  trackTransition({
    jobId: input.jobId,
    userId: input.userId,
    from: existing?.status,
    to: "running",
    reason: input.step ? `step:${input.step}` : "mark_running",
    retryCount: existing?.attemptCount ?? 0,
  });
  const stepEvidence = input.step
    ? buildStepEvidence(input.step, "running")
    : null;
  const steps = [...(existing?.steps ?? [])];
  if (stepEvidence) {
    const idx = steps.findIndex((s) => s.id === stepEvidence.id);
    if (idx >= 0) steps[idx] = stepEvidence;
    else steps.push(stepEvidence);
  }

  return persistJobRecord({
    id: input.jobId,
    userId: input.userId,
    automationId: input.automationId ?? existing?.automationId ?? null,
    jobType: existing?.jobType ?? "automation",
    status: "running",
    scheduledAt: existing?.scheduledAt ?? null,
    queuedAt: existing?.queuedAt ?? null,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    completedAt: null,
    failedAt: null,
    currentStep: input.step ?? existing?.currentStep ?? null,
    progressPercent: existing?.progressPercent ?? 10,
    attemptCount: existing?.attemptCount ?? 0,
    maxAttempts: existing?.maxAttempts ?? MAX_JOB_RETRIES,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultSummary: existing?.resultSummary ?? null,
    artifactId: existing?.artifactId ?? null,
    externalResultId: existing?.externalResultId ?? null,
    externalResultUrl: existing?.externalResultUrl ?? null,
    idempotencyKey: existing?.idempotencyKey ?? `${input.userId}::${input.jobId}`,
    pushStatus: existing?.pushStatus ?? "pending",
    autoRecovered: existing?.autoRecovered ?? false,
    steps,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/** Heartbeat for long-running jobs — refreshes updated_at. */
export async function heartbeatJob(input: {
  jobId: string;
  userId: string;
  step?: string | null;
  progressPercent?: number;
}): Promise<JobRecord | null> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  if (!existing || existing.status !== "running") return existing;

  const steps = [...existing.steps];
  if (input.step) {
    const completed = buildStepEvidence(input.step, "completed");
    const idx = steps.findIndex((s) => s.id === completed.id);
    if (idx >= 0) steps[idx] = completed;
    else steps.push(completed);
  }

  return persistJobRecord({
    ...existing,
    currentStep: input.step ?? existing.currentStep,
    progressPercent: input.progressPercent ?? existing.progressPercent,
    steps,
    updatedAt: new Date().toISOString(),
  });
}

export async function markJobFailed(input: {
  jobId: string;
  userId: string;
  error: unknown;
  automationId?: string | null;
  errorCode?: string | null;
}): Promise<{ record: JobRecord; willRetry: boolean }> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const maxAttempts = existing?.maxAttempts ?? MAX_JOB_RETRIES;
  const classification = classifyRetryError(input.error);
  const willRetry =
    classification === "retryable" && attemptCount <= maxAttempts;
  const nextStatus = willRetry ? "retrying" : "failed";

  const lastErrorMessage =
    typeof input.error === "string"
      ? input.error.slice(0, 240)
      : input.error instanceof Error
        ? input.error.message.slice(0, 240)
        : "処理に失敗しました";

  trackTransition({
    jobId: input.jobId,
    userId: input.userId,
    from: existing?.status,
    to: nextStatus,
    reason: lastErrorMessage,
    retryCount: attemptCount,
    failedStage: input.errorCode ?? "worker",
  });

  const now = new Date().toISOString();
  const record = await persistJobRecord({
    id: input.jobId,
    userId: input.userId,
    automationId: input.automationId ?? existing?.automationId ?? null,
    jobType: existing?.jobType ?? "automation",
    status: nextStatus,
    scheduledAt: existing?.scheduledAt ?? null,
    queuedAt: existing?.queuedAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: willRetry ? null : null,
    failedAt: willRetry ? null : now,
    currentStep: existing?.currentStep ?? null,
    progressPercent: existing?.progressPercent ?? 0,
    attemptCount,
    maxAttempts,
    nextRetryAt: willRetry ? computeNextRetryAt(attemptCount) : null,
    lastErrorCode: input.errorCode ?? existing?.lastErrorCode ?? null,
    lastErrorMessage,
    resultSummary: existing?.resultSummary ?? null,
    artifactId: existing?.artifactId ?? null,
    externalResultId: existing?.externalResultId ?? null,
    externalResultUrl: existing?.externalResultUrl ?? null,
    idempotencyKey: existing?.idempotencyKey ?? `${input.userId}::${input.jobId}`,
    pushStatus: willRetry ? "skipped" : (existing?.pushStatus ?? "pending"),
    autoRecovered: false,
    steps: existing?.steps ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  return { record, willRetry };
}

export async function markJobCompleted(input: {
  jobId: string;
  userId: string;
  status?: JobStatus;
  artifactId?: string | null;
  externalResultId?: string | null;
  externalResultUrl?: string | null;
  resultSummary?: string | null;
  autoRecovered?: boolean;
}): Promise<JobRecord> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  const nextStatus = input.status ?? "completed";
  if (
    nextStatus !== "completed" &&
    nextStatus !== "partially_completed" &&
    nextStatus !== "waiting_for_approval"
  ) {
    throw new Error(`invalid_completion_status:${nextStatus}`);
  }
  // completed requires artifact OR explicit external result OR summary evidence
  if (
    nextStatus === "completed" &&
    !input.artifactId &&
    !existing?.artifactId &&
    !input.externalResultId &&
    !existing?.externalResultId &&
    !(input.resultSummary ?? existing?.resultSummary)
  ) {
    throw new Error("completed_without_artifact_or_result");
  }
  trackTransition({
    jobId: input.jobId,
    userId: input.userId,
    from: existing?.status,
    to: nextStatus,
    reason: input.autoRecovered ? "auto_recovered" : "mark_completed",
    retryCount: existing?.attemptCount ?? 0,
  });
  const now = new Date().toISOString();
  return persistJobRecord({
    id: input.jobId,
    userId: input.userId,
    automationId: existing?.automationId ?? null,
    jobType: existing?.jobType ?? "automation",
    status: nextStatus,
    scheduledAt: existing?.scheduledAt ?? null,
    queuedAt: existing?.queuedAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: now,
    failedAt: null,
    currentStep: null,
    progressPercent: 100,
    attemptCount: existing?.attemptCount ?? 0,
    maxAttempts: existing?.maxAttempts ?? MAX_JOB_RETRIES,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultSummary: input.resultSummary ?? existing?.resultSummary ?? null,
    artifactId: input.artifactId ?? existing?.artifactId ?? null,
    externalResultId:
      input.externalResultId ?? existing?.externalResultId ?? null,
    externalResultUrl:
      input.externalResultUrl ?? existing?.externalResultUrl ?? null,
    idempotencyKey: existing?.idempotencyKey ?? `${input.userId}::${input.jobId}`,
    pushStatus: "pending",
    autoRecovered: input.autoRecovered ?? false,
    steps: existing?.steps ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function setJobPushStatus(
  jobId: string,
  userId: string,
  pushStatus: JobPushStatus,
): Promise<JobRecord | null> {
  const existing = await getStoredJobRecord(jobId, userId);
  if (!existing) return null;
  return persistJobRecord({ ...existing, pushStatus });
}

export async function markJobCancelled(input: {
  jobId: string;
  userId: string;
  reason?: string | null;
}): Promise<JobRecord> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  trackTransition({
    jobId: input.jobId,
    userId: input.userId,
    from: existing?.status,
    to: "cancelled",
    reason: input.reason ?? "user_cancelled",
    retryCount: existing?.attemptCount ?? 0,
    failedStage: "cancelled",
  });
  const now = new Date().toISOString();
  return persistJobRecord({
    id: input.jobId,
    userId: input.userId,
    automationId: existing?.automationId ?? null,
    jobType: existing?.jobType ?? "automation",
    status: "cancelled",
    scheduledAt: existing?.scheduledAt ?? null,
    queuedAt: existing?.queuedAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: null,
    failedAt: now,
    currentStep: existing?.currentStep ?? null,
    progressPercent: existing?.progressPercent ?? 0,
    attemptCount: existing?.attemptCount ?? 0,
    maxAttempts: existing?.maxAttempts ?? MAX_JOB_RETRIES,
    nextRetryAt: null,
    lastErrorCode: "cancelled",
    lastErrorMessage: input.reason ?? "user_cancelled",
    resultSummary: existing?.resultSummary ?? null,
    artifactId: existing?.artifactId ?? null,
    externalResultId: existing?.externalResultId ?? null,
    externalResultUrl: existing?.externalResultUrl ?? null,
    idempotencyKey: existing?.idempotencyKey ?? `${input.userId}::${input.jobId}`,
    pushStatus: "skipped",
    autoRecovered: false,
    steps: existing?.steps ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function markJobQueued(input: {
  jobId: string;
  userId: string;
  idempotencyKey: string;
  automationId?: string | null;
  jobType?: string;
}): Promise<JobRecord> {
  const existing = await getStoredJobRecord(input.jobId, input.userId);
  trackTransition({
    jobId: input.jobId,
    userId: input.userId,
    from: existing?.status,
    to: "queued",
    reason: "enqueue",
    retryCount: existing?.attemptCount ?? 0,
  });
  const now = new Date().toISOString();
  return persistJobRecord({
    id: input.jobId,
    userId: input.userId,
    automationId: input.automationId ?? existing?.automationId ?? null,
    jobType: input.jobType ?? existing?.jobType ?? "automation",
    status: "queued",
    scheduledAt: existing?.scheduledAt ?? null,
    queuedAt: existing?.queuedAt ?? now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    currentStep: null,
    progressPercent: 0,
    attemptCount: existing?.attemptCount ?? 0,
    maxAttempts: existing?.maxAttempts ?? MAX_JOB_RETRIES,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultSummary: null,
    artifactId: null,
    externalResultId: null,
    externalResultUrl: null,
    idempotencyKey: input.idempotencyKey,
    pushStatus: "pending",
    autoRecovered: false,
    steps: [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}