/** Retry policy for recurring automation runs — pure program logic, no AI. */

export const AUTOMATION_MAX_ATTEMPTS = 3;

/** Backoff between retries (ms). Attempt 1→2: 2s, 2→3: 5s. */
export const AUTOMATION_RETRY_BACKOFF_MS = [0, 2_000, 5_000] as const;

export function shouldRetryAutomationAttempt(
  attempt: number,
  succeeded: boolean,
): boolean {
  if (succeeded) return false;
  return attempt < AUTOMATION_MAX_ATTEMPTS;
}

export function retryBackoffMs(attempt: number): number {
  const index = Math.min(
    Math.max(attempt, 0),
    AUTOMATION_RETRY_BACKOFF_MS.length - 1,
  );
  return AUTOMATION_RETRY_BACKOFF_MS[index] ?? 0;
}

export function isFinalAutomationAttempt(attempt: number): boolean {
  return attempt >= AUTOMATION_MAX_ATTEMPTS;
}
