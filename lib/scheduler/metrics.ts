import { listSchedulerHistory } from "./history-store";
import type {
  SchedulerFailureReason,
  SchedulerMetrics,
  SchedulerProofSummary,
} from "./types";

const EMPTY_REASONS: Record<SchedulerFailureReason, number> = {
  timeout: 0,
  worker_busy: 0,
  queue_full: 0,
  storage: 0,
  external_api: 0,
  permission: 0,
  unknown: 0,
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function computeSchedulerMetrics(options?: {
  windowMs?: number;
  limit?: number;
  nowMs?: number;
}): SchedulerMetrics {
  const windowMs = options?.windowMs ?? 24 * 60 * 60 * 1000;
  const nowMs = options?.nowMs ?? Date.now();
  const cutoff = nowMs - windowMs;
  const rows = listSchedulerHistory(options?.limit ?? 2_000).filter((row) => {
    const t = Date.parse(row.endedAt);
    return Number.isFinite(t) && t >= cutoff;
  });

  const byFailureReason = { ...EMPTY_REASONS };
  let successes = 0;
  let failures = 0;
  let retryCount = 0;
  const delays: number[] = [];

  for (const row of rows) {
    if (row.success) successes += 1;
    else {
      failures += 1;
      if (row.failureReason) byFailureReason[row.failureReason] += 1;
    }
    retryCount += row.retryCount;
    delays.push(row.delayMs);
  }

  const total = rows.length;
  return {
    total,
    successes,
    failures,
    successRate: total === 0 ? null : successes / total,
    averageDelayMs:
      delays.length === 0
        ? null
        : delays.reduce((a, b) => a + b, 0) / delays.length,
    maxDelayMs: delays.length === 0 ? null : Math.max(...delays),
    p95DelayMs: percentile(delays, 95),
    retryCount,
    byFailureReason,
    windowMs,
    generatedAt: new Date(nowMs).toISOString(),
  };
}

export function buildSchedulerProofSummary(
  limit = 100,
): SchedulerProofSummary {
  const rows = listSchedulerHistory(limit);
  const successes = rows.filter((r) => r.success).length;
  const failures = rows.length - successes;
  const delays = rows.map((r) => r.delayMs);
  const averageDelayMs =
    delays.length === 0
      ? 0
      : delays.reduce((a, b) => a + b, 0) / delays.length;
  return {
    runs: rows.length,
    successes,
    failures,
    successRate: rows.length === 0 ? 0 : successes / rows.length,
    averageDelayMs,
    maxDelayMs: delays.length === 0 ? 0 : Math.max(...delays),
    rows: rows.map((r) => ({
      scheduledAt: r.scheduledAt,
      startedAt: r.startedAt,
      delayMs: r.delayMs,
      success: r.success,
      failureReason: r.failureReason,
    })),
    generatedAt: new Date().toISOString(),
  };
}
