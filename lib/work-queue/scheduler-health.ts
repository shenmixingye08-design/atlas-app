import type { WorkQueueMetrics } from "./types";

type EnqueueHealthCounts = {
  due: number;
  skipped: number;
  missed: number;
  delayed: number;
  deduped: number;
};

export const SCHEDULER_DEGRADED_MS = 5 * 60_000;
export const SCHEDULER_DOWN_MS = 15 * 60_000;

export type SchedulerHealthLevel = "ok" | "degraded" | "down";

export type SchedulerHealthSnapshot = {
  lastTickAt: string | null;
  lastSuccessfulTickAt: string | null;
  schedulerHealth: SchedulerHealthLevel;
  dueCount: number;
  queuedCount: number;
  runningCount: number;
  failedCount: number;
  retryCount: number;
  staleLeaseCount: number;
  oldestDueAge: number | null;
  executionLatency: number | null;
  duplicatePreventedCount: number;
  missedRunCount: number;
  delayedCount: number;
  skippedCount: number;
};

function latestIso(
  ...isos: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const iso of isos) {
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && ms >= bestMs) {
      best = iso;
      bestMs = ms;
    }
  }
  return best;
}

/**
 * Minute-aware Scheduler health.
 * DEGRADED after 5 minutes without a successful tick; DOWN after 15 minutes
 * or when the latest outcome is a failure newer than the last success.
 */
export function evaluateSchedulerHealth(input: {
  lastSuccessfulTickAt: string | null;
  lastFailureAt?: string | null;
  nowMs?: number;
  cronEnabled?: boolean;
}): SchedulerHealthLevel {
  const nowMs = input.nowMs ?? Date.now();
  if (input.cronEnabled === false) return "down";

  const successMs = input.lastSuccessfulTickAt
    ? Date.parse(input.lastSuccessfulTickAt)
    : Number.NaN;
  const failureMs = input.lastFailureAt
    ? Date.parse(input.lastFailureAt)
    : Number.NaN;
  const hasSuccess = Number.isFinite(successMs);
  const hasFailure = Number.isFinite(failureMs);

  if (hasFailure && (!hasSuccess || failureMs > successMs)) {
    return "down";
  }
  if (!hasSuccess) {
    return "degraded";
  }
  const age = nowMs - successMs;
  if (age > SCHEDULER_DOWN_MS) return "down";
  if (age > SCHEDULER_DEGRADED_MS) return "degraded";
  return "ok";
}

export function buildSchedulerHealthSnapshotFromMetrics(input: {
  metrics: WorkQueueMetrics;
  enqueue?: EnqueueHealthCounts;
  lastTickAt?: string | null;
  lastFailureAt?: string | null;
  nowMs?: number;
  cronEnabled?: boolean;
}): SchedulerHealthSnapshot {
  const lastSuccessfulTickAt = input.metrics.schedulerLastSuccessAt;
  const lastTickAt =
    input.lastTickAt ??
    latestIso(lastSuccessfulTickAt, input.lastFailureAt);
  return {
    lastTickAt,
    lastSuccessfulTickAt,
    schedulerHealth: evaluateSchedulerHealth({
      lastSuccessfulTickAt,
      lastFailureAt: input.lastFailureAt,
      nowMs: input.nowMs,
      cronEnabled: input.cronEnabled,
    }),
    dueCount: input.enqueue?.due ?? 0,
    queuedCount: input.metrics.queued,
    runningCount: input.metrics.running + input.metrics.leased,
    failedCount: input.metrics.failed + input.metrics.deadLetter,
    retryCount: input.metrics.retryScheduled,
    staleLeaseCount: input.metrics.stuck,
    oldestDueAge: input.metrics.oldestQueuedAgeMs,
    executionLatency: input.metrics.p95ExecutionMs,
    duplicatePreventedCount:
      input.metrics.duplicateCount + (input.enqueue?.deduped ?? 0),
    missedRunCount: input.enqueue?.missed ?? 0,
    delayedCount: input.enqueue?.delayed ?? 0,
    skippedCount: input.enqueue?.skipped ?? 0,
  };
}

export async function buildSchedulerHealthSnapshot(input?: {
  enqueue?: EnqueueHealthCounts;
  lastTickAt?: string | null;
  lastFailureAt?: string | null;
  nowMs?: number;
  cronEnabled?: boolean;
}): Promise<SchedulerHealthSnapshot> {
  const nowMs = input?.nowMs ?? Date.now();
  const { getWorkQueueStore } = await import("./store");
  const store = getWorkQueueStore();
  const metrics = await store.metrics(nowMs);
  const cronEnabled =
    input?.cronEnabled ??
    process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
  return buildSchedulerHealthSnapshotFromMetrics({
    metrics,
    enqueue: input?.enqueue,
    lastTickAt: input?.lastTickAt,
    lastFailureAt: input?.lastFailureAt,
    nowMs,
    cronEnabled,
  });
}
