import {
  classifyRetryError,
  IMMEDIATE_EXTERNAL_BACKOFF_MS,
} from "@/lib/jobs/retry-classifier";

/**
 * Retry an async operation with exponential backoff + jitter.
 * Only retries classifier-retryable errors (network/timeout/429/5xx).
 * Never retries permission_denied / revoked / 400 / cancelled.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    label?: string;
    backoffMs?: readonly number[];
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = options.backoffMs ?? IMMEDIATE_EXTERNAL_BACKOFF_MS;
  const label = options.label ?? "operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = classifyRetryError(error) === "retryable";
      if (attempt >= maxAttempts || !retryable) break;

      const base =
        backoff[Math.min(attempt - 1, backoff.length - 1)] ??
        options.baseDelayMs ??
        2_000;
      const jitter = Math.floor(base * 0.2 * Math.random());
      const delayMs = base + jitter;
      console.warn(
        `[withRetry] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
        error instanceof Error ? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`${label} failed after ${maxAttempts} attempts`);
}
