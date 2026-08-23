import type { WorkJobRecord } from "./store";

/**
 * Just over route maxDuration (300s). If a serverless after() is killed,
 * the job stays `running` with an old updatedAt — reclaim after this window.
 */
export const WORK_JOB_STALE_RUNNING_MS = 310_000;

/**
 * after() should start within seconds. If a job stays `queued` past this
 * window, poll / reused accept must reclaim it — without starting on the
 * millisecond-scale parallel-create losers (see p4 claim tests).
 */
export const WORK_JOB_STALE_QUEUED_MS = 15_000;

export function isStaleWorkJobRunning(
  job: WorkJobRecord,
  nowMs = Date.now(),
): boolean {
  if (job.status !== "running") return false;
  const updatedMs = new Date(job.updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return nowMs - updatedMs > WORK_JOB_STALE_RUNNING_MS;
}

export function isStaleWorkJobQueued(
  job: WorkJobRecord,
  nowMs = Date.now(),
): boolean {
  if (job.status !== "queued") return false;
  const updatedMs = new Date(job.updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return nowMs - updatedMs > WORK_JOB_STALE_QUEUED_MS;
}

export function isWorkJobTerminal(status: WorkJobRecord["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "awaiting_confirmation"
  );
}
