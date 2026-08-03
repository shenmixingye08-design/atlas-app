/**
 * Worker lease / zombie / lost job reclaim helpers (pure, no I/O).
 */

export const DEFAULT_LEASE_STALE_MS = 310_000;

export type LeaseClaimResult =
  | { action: "skip_terminal" }
  | { action: "skip_fresh_lease"; workerId: string | null }
  | { action: "force_failed"; reason: string }
  | { action: "reclaim"; reason: "zombie" | "lost" | "stuck" | "retry" }
  | { action: "claim"; workerId: string };

export function decideLeaseClaim(input: {
  status: string;
  updatedAt: string;
  attemptCount: number;
  maxAttempts: number;
  workerId?: string | null;
  nowMs?: number;
  staleMs?: number;
  newWorkerId: string;
  isInProgress: boolean;
  isTerminal: boolean;
}): LeaseClaimResult {
  const now = input.nowMs ?? Date.now();
  const staleMs = input.staleMs ?? DEFAULT_LEASE_STALE_MS;
  const updatedMs = new Date(input.updatedAt).getTime();
  const age = Number.isNaN(updatedMs) ? staleMs + 1 : now - updatedMs;
  const isStale = age > staleMs;

  if (input.isTerminal) {
    return { action: "skip_terminal" };
  }

  if (input.isInProgress && !isStale) {
    return {
      action: "skip_fresh_lease",
      workerId: input.workerId ?? null,
    };
  }

  if (input.isInProgress && isStale) {
    if (input.attemptCount >= input.maxAttempts) {
      return {
        action: "force_failed",
        reason: "zombie_max_attempts",
      };
    }
    return {
      action: "reclaim",
      reason: age > staleMs * 2 ? "lost" : "zombie",
    };
  }

  if (input.status === "retrying") {
    return { action: "reclaim", reason: "retry" };
  }

  if (input.status === "queued") {
    return { action: "claim", workerId: input.newWorkerId };
  }

  // stuck unknown / queued-like
  if (isStale) {
    return { action: "reclaim", reason: "stuck" };
  }

  return { action: "claim", workerId: input.newWorkerId };
}

export function newWorkerId(): string {
  return `worker_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
