import { classifyRetryError } from "@/lib/jobs/retry-classifier";
import {
  classifyFailure,
  isRetryableClassifiedFailure,
} from "@/lib/reliability/error-classification";

/** Immediate-call retry delays (not job-scheduler delays). */
export const IMMEDIATE_RETRY_BACKOFF_MS = [500, 1_500, 4_000, 8_000] as const;
/**
 * Total attempts including the first.
 * Requirement: at least 3 automatic retries → 1 initial + 3 retries = 4.
 */
export const MAX_IMMEDIATE_RETRIES = 4;

export type RetryOptions = {
  /** Total attempts including the first (default 4 = 3 retries). */
  maxAttempts?: number;
  /** Backoff schedule in ms (default 500 / 1500 / 4000 / 8000). */
  backoffMs?: readonly number[];
  /** Override retry classification. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (
    error: unknown,
    attempt: number,
    delayMs: number,
    meta: {
      failureClass: ReturnType<typeof classifyFailure>;
      durationMs?: number;
    },
  ) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultShouldRetry(error: unknown): boolean {
  if (isRetryableClassifiedFailure(error)) return true;
  if (classifyRetryError(error) === "retryable") return true;
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  // Status codes commonly thrown by our API helpers.
  return /(?:^|\D)(429|500|502|503|504)(?:\D|$)/.test(message);
}

/**
 * Run an async operation with up to 4 attempts (3 retries) and exponential backoff.
 * Retries on timeout / network / OpenAI / JSON / save / generation / 429 / 5xx.
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
    const started = Date.now();
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const failureClass = classifyFailure(error);
      const durationMs = Date.now() - started;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay =
        backoff[Math.min(attempt - 1, backoff.length - 1)] ??
        backoff[backoff.length - 1]!;
      options.onRetry?.(error, attempt, delay, { failureClass, durationMs });
      await sleep(delay);
    }
  }
  throw lastError;
}
