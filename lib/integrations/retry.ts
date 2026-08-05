import {
  classifyIntegrationError,
  computeBackoffDelayMs,
} from "@/lib/integrations/production/retry";

/** Retry an async operation with exponential backoff + jitter (429/5xx/timeout/network). */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const label = options.label ?? "operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classification = classifyIntegrationError(error);

      if (classification === "non_retryable" || attempt >= maxAttempts) break;

      const delayMs = computeBackoffDelayMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        classification,
        random: Math.random,
      });
      console.warn(
        `[withRetry] ${label} failed (attempt ${attempt}/${maxAttempts}, ${classification}), retrying in ${delayMs}ms`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`${label} failed after ${maxAttempts} attempts`);
}
