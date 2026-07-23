/** Retry policy for recurring automation runs — pure program logic, no AI. */

/** Initial attempt + up to 3 deferred retries. */
export const AUTOMATION_MAX_ATTEMPTS = 4;
export const AUTOMATION_MAX_RETRIES = 3;

/**
 * Backoff after failure N (1-based retry index).
 * 1st retry: 30s, 2nd: 5min, 3rd: 30min.
 */
export const AUTOMATION_RETRY_BACKOFF_MS = [
  30_000,
  300_000,
  1_800_000,
] as const;

export function shouldRetryAutomationAttempt(
  attempt: number,
  succeeded: boolean,
): boolean {
  if (succeeded) return false;
  return attempt < AUTOMATION_MAX_ATTEMPTS;
}

/** Backoff before the next attempt after a failed `failedAttempt` (1-based). */
export function retryBackoffMs(failedAttempt: number): number {
  const retryIndex = Math.max(0, failedAttempt - 1);
  const index = Math.min(retryIndex, AUTOMATION_RETRY_BACKOFF_MS.length - 1);
  return AUTOMATION_RETRY_BACKOFF_MS[index] ?? AUTOMATION_RETRY_BACKOFF_MS[2];
}

export function nextRetryAtIso(
  failedAttempt: number,
  from: Date = new Date(),
): string {
  return new Date(from.getTime() + retryBackoffMs(failedAttempt)).toISOString();
}

export function isFinalAutomationAttempt(attempt: number): boolean {
  return attempt >= AUTOMATION_MAX_ATTEMPTS;
}

export function formatRetryDelay(failedAttempt: number): string {
  const ms = retryBackoffMs(failedAttempt);
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒後`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分後`;
  return `${Math.round(ms / 3_600_000)}時間後`;
}
