import { EXECUTION_MAX_RETRIES } from "./constants";

export type RetryOptions = {
  maxAttempts?: number;
  /** Delay between attempts in ms (fixed or per-attempt). */
  delayMs?: number | ((attempt: number) => number);
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
};

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("cancelled") || message.includes("abort")) return false;
    if (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("429")
    ) {
      return true;
    }
  }
  return true;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retry wrapper for transient client/network failures.
 * Does not alter orchestration internals — wraps the call site only.
 */
export async function withExecutionRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? EXECUTION_MAX_RETRIES + 1);
  const shouldRetry = options.shouldRetry ?? ((error) => defaultShouldRetry(error));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && shouldRetry(error, attempt);
      if (!canRetry) throw error;
      options.onRetry?.(error, attempt);
      const delay =
        typeof options.delayMs === "function"
          ? options.delayMs(attempt)
          : (options.delayMs ?? Math.min(1000 * attempt, 4000));
      if (delay > 0) await wait(delay);
    }
  }
  throw lastError;
}
