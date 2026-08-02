/**
 * Retry policy for live external calls.
 * 429 / transient network → retry; auth errors → no retry (reconnect).
 */

export function isRetryableLiveError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    status?: number;
    code?: string;
    message?: string;
    retryable?: boolean;
  };
  if (typeof err.retryable === "boolean") return err.retryable;
  if (err.status === 429) return true;
  if (err.status && err.status >= 500) return true;
  const msg = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase();
  if (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("temporarily") ||
    msg.includes("econnreset")
  ) {
    return true;
  }
  if (
    msg.includes("unauthorized") ||
    msg.includes("invalid_grant") ||
    msg.includes("reconnect") ||
    msg.includes("insufficient") ||
    msg.includes("expired") ||
    msg.includes("401") ||
    msg.includes("403")
  ) {
    return false;
  }
  // Default: allow one class of unknown network failures as retryable
  return true;
}

export class NonRetryableLiveError extends Error {
  readonly retryable = false;
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "NonRetryableLiveError";
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withLiveRetry<T>(
  operation: () => Promise<T>,
  label: string,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableLiveError(error) || attempt >= maxAttempts) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[live-retry] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
        error instanceof Error ? error.message : "error",
      );
      await sleep(delayMs);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`${label} failed after ${maxAttempts} attempts`);
}
