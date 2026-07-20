import "server-only";

/**
 * Default timeout for outbound calls to third-party APIs (X, Google, etc).
 * Without a timeout, a hanging upstream request can block deliverable
 * completion for tens of minutes. 20s is generous for a single API call
 * while still failing fast enough to keep the pipeline responsive.
 */
export const DEFAULT_EXTERNAL_FETCH_TIMEOUT_MS = 20_000;

export class ExternalFetchTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly timedOut = true;

  constructor(timeoutMs: number) {
    super(`External request timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "ExternalFetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * `fetch` wrapper that aborts after `timeoutMs`.
 *
 * Any caller-supplied `signal` is respected in addition to the timeout, so
 * upstream cancellation still works. On timeout a typed error is thrown so
 * callers can surface an accurate message instead of hanging indefinitely.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const signals: AbortSignal[] = [controller.signal];
  if (init.signal) signals.push(init.signal);
  const signal =
    signals.length > 1 ? AbortSignal.any(signals) : controller.signal;

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new ExternalFetchTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
