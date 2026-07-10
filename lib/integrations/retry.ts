/** Retry an async operation with exponential backoff. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const label = options.label ?? "operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) break;

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[withRetry] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`${label} failed after ${maxAttempts} attempts`);
}
