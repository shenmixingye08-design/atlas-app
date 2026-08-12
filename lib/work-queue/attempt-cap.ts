/**
 * Keep job.attempt within atlas_work_queue_jobs_attempt_check:
 *   attempt >= 0 AND max_attempts >= 1 AND attempt <= max_attempts + 1
 *
 * Production evidence (Minute Scheduler 31586920503): reclaim/claim of
 * expired leases did `attempt + 1` past the ceiling → pgCode 23514.
 */

export function capWorkQueueAttempt(
  attempt: number,
  maxAttempts: number,
): number {
  const max = Math.max(1, Math.floor(maxAttempts));
  const next = Math.floor(attempt);
  if (!Number.isFinite(next) || next < 0) return 0;
  return Math.min(next, max + 1);
}

/** True when another execution attempt is not allowed. */
export function isWorkQueueAttemptExhausted(
  attempt: number,
  maxAttempts: number,
): boolean {
  const max = Math.max(1, Math.floor(maxAttempts));
  return Math.floor(attempt) >= max;
}

/** Extract Postgres constraint name from a driver error message (safe). */
export function extractPostgresConstraintName(message: string): string | null {
  const m =
    /constraint ["']([a-zA-Z0-9_]+)["']/i.exec(message) ??
    /violates check constraint ["']([a-zA-Z0-9_]+)["']/i.exec(message);
  return m?.[1] ?? null;
}
