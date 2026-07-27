import "server-only";

import { recordDeveloperError } from "@/lib/reliability/developer-log";

import { executeWorkJob } from "./run";
import {
  getWorkJob,
  listWorkJobsForUser,
  saveWorkJob,
  type WorkJobRecord,
} from "./store";

/** Running jobs without progress for this long are treated as hung. */
export const WORK_JOB_HANG_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Re-queue a failed (or hung) work job for another background execution.
 * Used by the notification「再実行」button and auto-recovery.
 */
export async function retryWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  if (existing.status === "completed") {
    return existing;
  }

  const now = new Date().toISOString();
  const queued = saveWorkJob({
    ...existing,
    status: "queued",
    error: null,
    completedAt: null,
    updatedAt: now,
  });

  return executeWorkJob(queued.id, userId);
}

/** Detect hung running jobs and mark them for retry. */
export function recoverStaleWorkJobs(userId?: string): {
  recovered: number;
  jobs: WorkJobRecord[];
} {
  const now = Date.now();
  const allJobs = userId
    ? listWorkJobsForUser(userId)
    : listAllWorkJobsFromMemory();

  const recovered: WorkJobRecord[] = [];

  for (const job of allJobs) {
    if (job.status !== "running" && job.status !== "queued") continue;
    const updatedMs = Date.parse(job.updatedAt) || Date.parse(job.createdAt);
    if (!Number.isFinite(updatedMs)) continue;
    if (now - updatedMs < WORK_JOB_HANG_TIMEOUT_MS) continue;

    recordDeveloperError({
      userId: job.userId,
      jobId: job.id,
      step: "execute",
      attempt: job.attemptCount,
      maxAttempts: job.maxAttempts,
      error: new Error("処理が長時間停止していたため自動復旧します"),
      failureClass: "timeout",
      processLog: `stale status=${job.status} updatedAt=${job.updatedAt}`,
      metadata: { recovery: true },
    });

    const canRetry = job.attemptCount < job.maxAttempts;
    const next = saveWorkJob({
      ...job,
      status: canRetry ? "queued" : "failed",
      error: canRetry
        ? "処理が長時間停止していたため再試行します"
        : "処理が長時間停止し、再試行上限に達しました",
      updatedAt: new Date().toISOString(),
      completedAt: canRetry ? null : new Date().toISOString(),
    });
    recovered.push(next);
  }

  return { recovered: recovered.length, jobs: recovered };
}

function listAllWorkJobsFromMemory(): WorkJobRecord[] {
  const g = globalThis as typeof globalThis & {
    __atlasWorkJobs?: Map<string, WorkJobRecord>;
  };
  if (!g.__atlasWorkJobs) return [];
  return [...g.__atlasWorkJobs.values()];
}

/**
 * Resume due queued / recovered jobs for a user (browser focus / poll).
 * Continues processing even after refresh / disconnect / tab close.
 */
export async function resumeDueWorkJobs(userId: string): Promise<{
  resumed: number;
  jobIds: string[];
}> {
  const recovery = recoverStaleWorkJobs(userId);
  const due = listWorkJobsForUser(userId).filter(
    (job) => job.status === "queued" || job.status === "failed",
  );

  // Only auto-resume queued (including recovered). Failed needs explicit retry
  // unless it was just recovered into queued.
  const queued = due.filter((job) => job.status === "queued");
  const jobIds: string[] = [];

  for (const job of queued) {
    try {
      await executeWorkJob(job.id, userId);
      jobIds.push(job.id);
    } catch (error) {
      recordDeveloperError({
        userId,
        jobId: job.id,
        step: "execute",
        attempt: job.attemptCount,
        maxAttempts: job.maxAttempts,
        error,
        processLog: "resumeDueWorkJobs failed",
        metadata: { recoveredCount: recovery.recovered },
      });
    }
  }

  return { resumed: jobIds.length, jobIds };
}
