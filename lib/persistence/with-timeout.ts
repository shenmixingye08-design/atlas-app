import "server-only";

/**
 * Ceiling for a single durable-store round-trip (Clerk metadata / Supabase).
 * These calls are normally sub-second, but a stalled TCP connection has no
 * built-in timeout and would otherwise block a request indefinitely — the
 * observed "deliverable hangs 30+ minutes" symptom. Failing over to a fallback
 * keeps the request responsive; the durable write is retried on the next
 * mutation and the read simply degrades to "not yet hydrated".
 */
export const DEFAULT_PERSISTENCE_TIMEOUT_MS = 8_000;

/**
 * Resolve with `fallback` if `operation` does not settle within `timeoutMs`.
 * Never rejects on timeout — persistence must degrade gracefully, not throw.
 */
export async function withPersistenceTimeout<T>(
  operation: () => Promise<T>,
  fallback: T,
  timeoutMs: number = DEFAULT_PERSISTENCE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
