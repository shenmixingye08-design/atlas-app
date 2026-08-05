import type { RetryClassification } from "./types";

export type IntegrationRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  /** Injected for tests — defaults to Math.random. */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    classification: RetryClassification;
    error: unknown;
  }) => void;
};

export class IntegrationHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(
    status: number,
    message: string,
    options?: { retryAfterMs?: number | null },
  ) {
    super(message);
    this.name = "IntegrationHttpError";
    this.status = status;
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }
}

export function classifyIntegrationError(error: unknown): RetryClassification {
  if (error instanceof IntegrationHttpError) {
    if (error.status === 429) return "retryable_429";
    if (error.status >= 500 && error.status <= 599) return "retryable_5xx";
    return "non_retryable";
  }

  if (error && typeof error === "object") {
    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : null;
    if (status === 429) return "retryable_429";
    if (status !== null && status >= 500 && status <= 599) {
      return "retryable_5xx";
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "retryable_timeout";
  }

  if (
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("socket")
  ) {
    return "retryable_network";
  }

  if (/\b429\b/.test(lower) || lower.includes("rate limit")) {
    return "retryable_429";
  }

  if (/\b5\d{2}\b/.test(lower)) {
    return "retryable_5xx";
  }

  return "non_retryable";
}

export function computeBackoffDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  classification: RetryClassification;
  retryAfterMs?: number | null;
  random: () => number;
}): number {
  if (
    input.classification === "retryable_429" &&
    typeof input.retryAfterMs === "number" &&
    input.retryAfterMs > 0
  ) {
    const jitter = Math.floor(input.random() * 100);
    return Math.min(input.maxDelayMs, input.retryAfterMs + jitter);
  }

  const exp = input.baseDelayMs * 2 ** Math.max(0, input.attempt - 1);
  const capped = Math.min(input.maxDelayMs, exp);
  const jitter = Math.floor(input.random() * Math.max(1, capped * 0.25));
  return Math.min(input.maxDelayMs, capped + jitter);
}

/**
 * Retry 429 / timeout / network / 5xx with exponential backoff + jitter.
 * Auth, validation, and other 4xx errors are not retried.
 */
export async function withIntegrationRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: IntegrationRetryOptions = {},
): Promise<{ value: T; attempts: number }> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error;
      const classification = classifyIntegrationError(error);
      if (classification === "non_retryable" || attempt >= maxAttempts) {
        break;
      }

      const retryAfterMs =
        error instanceof IntegrationHttpError ? error.retryAfterMs : null;
      const delayMs = computeBackoffDelayMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        classification,
        retryAfterMs,
        random,
      });

      options.onRetry?.({
        attempt,
        delayMs,
        classification,
        error,
      });

      await sleep(delayMs);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(
    `${options.label ?? "integration"} failed after ${maxAttempts} attempts`,
  );
}
