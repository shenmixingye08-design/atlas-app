/**
 * Integration retry — only 429 / timeout / network / 5xx.
 * Arbitrary 4xx must not retry.
 */

import {
  classifyError,
  executeWithRetryPolicy,
  isRetryable,
  type RetryOutcome,
  type RetryPolicyOptions,
} from "@/lib/integration-platform/retry-policy";

export { classifyError, isRetryable, executeWithRetryPolicy };
export type { RetryOutcome, RetryPolicyOptions };

/** Retry an async operation with exponential backoff (retryable errors only). */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const outcome = await executeWithRetryPolicy(
    async () => operation(),
    {
      maxAttempts: options.maxAttempts ?? 3,
      baseDelayMs: options.baseDelayMs ?? 500,
      label: options.label ?? "operation",
    },
  );
  return outcome.value;
}
