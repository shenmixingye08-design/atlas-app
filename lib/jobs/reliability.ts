/**
 * Durable job state for automations / scheduled work.
 * Extends execution-reliability with push status and retry scheduling.
 */

import {
  classifyRetryError,
  computeNextRetryAt,
  MAX_JOB_RETRIES,
} from "./retry-classifier";

export type JobStatus =
  | "scheduled"
  | "queued"
  | "running"
  | "retrying"
  | "waiting_for_approval"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type JobPushStatus = "pending" | "sent" | "failed" | "skipped";

export type JobRecord = {
  jobId: string;
  userId: string;
  automationId: string | null;
  status: JobStatus;
  step: string | null;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  nextRetryAt: string | null;
  artifactIds: string[];
  pushStatus: JobPushStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  autoRecovered: boolean;
};

const MAX_JOBS = 1000;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotJobRecords?: Map<string, JobRecord>;
  };
}

function jobKey(jobId: string, userId: string): string {
  return `${userId}::${jobId}`;
}

function getJobs(): Map<string, JobRecord> {
  const scope = getGlobalScope();
  if (!scope.__minervotJobRecords) {
    scope.__minervotJobRecords = new Map();
  }
  return scope.__minervotJobRecords;
}

export function upsertJobRecord(
  input: Omit<JobRecord, "updatedAt"> & { updatedAt?: string },
): JobRecord {
  const key = jobKey(input.jobId, input.userId);
  const next: JobRecord = {
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
  getJobs().set(key, next);

  const jobs = getJobs();
  if (jobs.size > MAX_JOBS) {
    const oldestKey = jobs.keys().next().value;
    if (oldestKey) jobs.delete(oldestKey);
  }

  return next;
}

export function getJobRecord(jobId: string, userId: string): JobRecord | null {
  return getJobs().get(jobKey(jobId, userId)) ?? null;
}

export function markJobRunning(input: {
  jobId: string;
  userId: string;
  automationId?: string | null;
  step?: string | null;
}): JobRecord {
  const existing = getJobRecord(input.jobId, input.userId);
  return upsertJobRecord({
    jobId: input.jobId,
    userId: input.userId,
    automationId: input.automationId ?? existing?.automationId ?? null,
    status: "running",
    step: input.step ?? existing?.step ?? null,
    retryCount: existing?.retryCount ?? 0,
    maxRetries: existing?.maxRetries ?? MAX_JOB_RETRIES,
    lastError: null,
    nextRetryAt: null,
    artifactIds: existing?.artifactIds ?? [],
    pushStatus: existing?.pushStatus ?? "pending",
    scheduledAt: existing?.scheduledAt ?? null,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    completedAt: null,
    autoRecovered: false,
  });
}

export function markJobFailed(input: {
  jobId: string;
  userId: string;
  error: unknown;
  automationId?: string | null;
}): { record: JobRecord; willRetry: boolean } {
  const existing = getJobRecord(input.jobId, input.userId);
  const retryCount = (existing?.retryCount ?? 0) + 1;
  const maxRetries = existing?.maxRetries ?? MAX_JOB_RETRIES;
  const classification = classifyRetryError(input.error);
  const willRetry =
    classification === "retryable" && retryCount <= maxRetries;

  const lastError =
    typeof input.error === "string"
      ? input.error.slice(0, 240)
      : input.error instanceof Error
        ? input.error.message.slice(0, 240)
        : "処理に失敗しました";

  const record = upsertJobRecord({
    jobId: input.jobId,
    userId: input.userId,
    automationId: input.automationId ?? existing?.automationId ?? null,
    status: willRetry ? "retrying" : "failed",
    step: existing?.step ?? null,
    retryCount,
    maxRetries,
    lastError,
    nextRetryAt: willRetry ? computeNextRetryAt(retryCount) : null,
    artifactIds: existing?.artifactIds ?? [],
    pushStatus: willRetry ? "skipped" : (existing?.pushStatus ?? "pending"),
    scheduledAt: existing?.scheduledAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: willRetry ? null : new Date().toISOString(),
    autoRecovered: false,
  });

  return { record, willRetry };
}

export function markJobCompleted(input: {
  jobId: string;
  userId: string;
  artifactIds?: string[];
  autoRecovered?: boolean;
}): JobRecord {
  const existing = getJobRecord(input.jobId, input.userId);
  return upsertJobRecord({
    jobId: input.jobId,
    userId: input.userId,
    automationId: existing?.automationId ?? null,
    status: "completed",
    step: null,
    retryCount: existing?.retryCount ?? 0,
    maxRetries: existing?.maxRetries ?? MAX_JOB_RETRIES,
    lastError: null,
    nextRetryAt: null,
    artifactIds: input.artifactIds ?? existing?.artifactIds ?? [],
    pushStatus: "pending",
    scheduledAt: existing?.scheduledAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: new Date().toISOString(),
    autoRecovered: input.autoRecovered ?? false,
  });
}

export function listDueRetries(nowMs = Date.now()): JobRecord[] {
  const now = new Date(nowMs).toISOString();
  return [...getJobs().values()].filter(
    (job) =>
      job.status === "retrying" &&
      job.nextRetryAt != null &&
      job.nextRetryAt <= now,
  );
}

export function setJobPushStatus(
  jobId: string,
  userId: string,
  pushStatus: JobPushStatus,
): JobRecord | null {
  const existing = getJobRecord(jobId, userId);
  if (!existing) return null;
  return upsertJobRecord({ ...existing, pushStatus });
}
