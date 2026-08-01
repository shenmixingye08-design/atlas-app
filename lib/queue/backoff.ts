/**
 * Retry backoff with exponential growth + full jitter.
 * Records each delay for audit.
 */

export type BackoffRecord = {
  attempt: number;
  delayMs: number;
  jitterMs: number;
  at: string;
  reason?: string | null;
};

/** Immediate (in-process) retry base delays. */
export const IMMEDIATE_BACKOFF_BASE_MS = [500, 1_500, 4_000] as const;

/** Scheduled job retry base delays: 1m / 5m / 15m. */
export const SCHEDULED_BACKOFF_BASE_MS = [60_000, 300_000, 900_000] as const;

export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Full jitter: delay = random(0, base).
 * Guarantees at least 10% of base to avoid thundering herd zero-wait.
 */
export function computeBackoffWithJitter(input: {
  attempt: number;
  bases?: readonly number[];
  nowMs?: number;
  random?: () => number;
}): { delayMs: number; jitterMs: number; nextAt: string; record: BackoffRecord } {
  const bases = input.bases ?? IMMEDIATE_BACKOFF_BASE_MS;
  const attempt = Math.max(1, input.attempt);
  const base =
    bases[Math.min(attempt - 1, bases.length - 1)] ?? bases[bases.length - 1]!;
  const rand = input.random ?? Math.random;
  const minDelay = Math.floor(base * 0.1);
  const jitterSpan = base - minDelay;
  const jitterMs = Math.floor(rand() * (jitterSpan + 1));
  const delayMs = clamp(minDelay + jitterMs, minDelay, base);
  const now = input.nowMs ?? Date.now();
  const nextAt = new Date(now + delayMs).toISOString();
  return {
    delayMs,
    jitterMs,
    nextAt,
    record: {
      attempt,
      delayMs,
      jitterMs,
      at: new Date(now).toISOString(),
    },
  };
}

export function appendBackoffRecord(
  records: BackoffRecord[] | undefined,
  record: BackoffRecord,
  max = 32,
): BackoffRecord[] {
  const next = [...(records ?? []), record];
  return next.length > max ? next.slice(next.length - max) : next;
}
