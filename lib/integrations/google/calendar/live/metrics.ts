import type { CalendarAdapterMetricsSnapshot } from "./types";

type CounterBucket = {
  createCount: number;
  updateCount: number;
  cancelCount: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  tokenRefreshCount: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  invalidDateCount: number;
  invalidAttendeeCount: number;
  scopeErrorCount: number;
  verificationFailureCount: number;
  conflictDetectedCount: number;
  latenciesMs: number[];
};

function getBucket(): CounterBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasCalendarLiveMetrics?: CounterBucket;
  };
  if (!scope.__atlasCalendarLiveMetrics) {
    scope.__atlasCalendarLiveMetrics = {
      createCount: 0,
      updateCount: 0,
      cancelCount: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      tokenRefreshCount: 0,
      duplicatePreventedCount: 0,
      approvalWaitCount: 0,
      invalidDateCount: 0,
      invalidAttendeeCount: 0,
      scopeErrorCount: 0,
      verificationFailureCount: 0,
      conflictDetectedCount: 0,
      latenciesMs: [],
    };
  }
  return scope.__atlasCalendarLiveMetrics;
}

export function resetCalendarLiveMetricsForTests(): void {
  const bucket = getBucket();
  for (const key of Object.keys(bucket) as (keyof CounterBucket)[]) {
    if (key === "latenciesMs") bucket.latenciesMs = [];
    else (bucket[key] as number) = 0;
  }
}

export function recordCalendarCreate(latencyMs: number): void {
  const b = getBucket();
  b.createCount += 1;
  b.latenciesMs.push(latencyMs);
}
export function recordCalendarUpdate(latencyMs: number): void {
  const b = getBucket();
  b.updateCount += 1;
  b.latenciesMs.push(latencyMs);
}
export function recordCalendarCancel(latencyMs: number): void {
  const b = getBucket();
  b.cancelCount += 1;
  b.latenciesMs.push(latencyMs);
}
export function recordCalendarSuccess(): void {
  getBucket().successCount += 1;
}
export function recordCalendarFailure(): void {
  getBucket().failureCount += 1;
}
export function recordCalendarRetry(): void {
  getBucket().retryCount += 1;
}
export function recordCalendarTokenRefresh(): void {
  getBucket().tokenRefreshCount += 1;
}
export function recordCalendarDuplicatePrevented(): void {
  getBucket().duplicatePreventedCount += 1;
}
export function recordCalendarApprovalWait(): void {
  getBucket().approvalWaitCount += 1;
}
export function recordCalendarInvalidDate(): void {
  getBucket().invalidDateCount += 1;
}
export function recordCalendarInvalidAttendee(): void {
  getBucket().invalidAttendeeCount += 1;
}
export function recordCalendarScopeError(): void {
  getBucket().scopeErrorCount += 1;
}
export function recordCalendarVerificationFailure(): void {
  getBucket().verificationFailureCount += 1;
}
export function recordCalendarConflictDetected(): void {
  getBucket().conflictDetectedCount += 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function getCalendarAdapterMetrics(): CalendarAdapterMetricsSnapshot {
  const b = getBucket();
  const total = b.successCount + b.failureCount;
  const latencies = [...b.latenciesMs].sort((a, c) => a - c);
  const ops = b.createCount + b.updateCount + b.cancelCount;
  const averageLatencyMs =
    latencies.length === 0
      ? 0
      : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  return {
    createCount: b.createCount,
    updateCount: b.updateCount,
    cancelCount: b.cancelCount,
    successRate: total === 0 ? 0 : b.successCount / total,
    failureRate: total === 0 ? 0 : b.failureCount / total,
    averageLatencyMs,
    p95LatencyMs: percentile(latencies, 95),
    retryRate: ops === 0 ? 0 : b.retryCount / ops,
    tokenRefreshRate: ops === 0 ? 0 : b.tokenRefreshCount / ops,
    duplicatePreventedCount: b.duplicatePreventedCount,
    approvalWaitCount: b.approvalWaitCount,
    invalidDateCount: b.invalidDateCount,
    invalidAttendeeCount: b.invalidAttendeeCount,
    scopeErrorCount: b.scopeErrorCount,
    verificationFailureCount: b.verificationFailureCount,
    conflictDetectedCount: b.conflictDetectedCount,
    latenciesMs: latencies,
  };
}
