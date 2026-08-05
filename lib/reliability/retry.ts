import { classifyRetryError } from "@/lib/jobs/retry-classifier";

import { isRetryableClassifiedFailure } from "./error-classification";

/** Immediate-call retry delays (not job-scheduler delays). */
export const IMMEDIATE_RETRY_BACKOFF_MS = [500, 1_500, 4_000] as const;
export const MAX_IMMEDIATE_RETRIES = 3;

export type RetryOptions = {
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Backoff schedule in ms (default 500 / 1500 / 4000). */
  backoffMs?: readonly number[];
  /** Override retry classification. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultShouldRetry(error: unknown): boolean {
  // P06: API / Storage / DB / Timeout all auto-retry when classified retryable.
  if (isRetryableClassifiedFailure(error)) return true;
  if (classifyRetryError(error) === "retryable") return true;
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return /(?:^|\D)(429|500|502|503|504)(?:\D|$)|storage|supabase|database|db_|timeout|ETIMEDOUT/i.test(
    message,
  );
}

/**
 * Run an async operation with up to 3 attempts and exponential backoff.
 * Retries on timeout / 429 / 5xx (and classifier "retryable").
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_IMMEDIATE_RETRIES;
  const backoff = options.backoffMs ?? IMMEDIATE_RETRY_BACKOFF_MS;
  const shouldRetry = options.shouldRetry ?? ((err) => defaultShouldRetry(err));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay =
        backoff[Math.min(attempt - 1, backoff.length - 1)] ??
        backoff[backoff.length - 1]!;
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
