import type { WordPressAdapterMetricsSnapshot } from "./types";

type CounterBucket = {
  draftCount: number;
  publishCount: number;
  updateCount: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  mediaFailureCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};

function getBucket(): CounterBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasWordPressLiveMetrics?: CounterBucket;
  };
  if (!scope.__atlasWordPressLiveMetrics) {
    scope.__atlasWordPressLiveMetrics = {
      draftCount: 0,
      publishCount: 0,
      updateCount: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      duplicatePreventedCount: 0,
      approvalWaitCount: 0,
      mediaFailureCount: 0,
      verificationFailureCount: 0,
      latenciesMs: [],
    };
  }
  return scope.__atlasWordPressLiveMetrics;
}

export function resetWordPressLiveMetricsForTests(): void {
  const bucket = getBucket();
  bucket.draftCount = 0;
  bucket.publishCount = 0;
  bucket.updateCount = 0;
  bucket.successCount = 0;
  bucket.failureCount = 0;
  bucket.retryCount = 0;
  bucket.duplicatePreventedCount = 0;
  bucket.approvalWaitCount = 0;
  bucket.mediaFailureCount = 0;
  bucket.verificationFailureCount = 0;
  bucket.latenciesMs = [];
}

export function recordWordPressDraftAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.draftCount += 1;
  bucket.latenciesMs.push(latencyMs);
}

export function recordWordPressPublishAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.publishCount += 1;
  bucket.latenciesMs.push(latencyMs);
}

export function recordWordPressUpdateAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.updateCount += 1;
  bucket.latenciesMs.push(latencyMs);
}

export function recordWordPressSuccess(): void {
  getBucket().successCount += 1;
}

export function recordWordPressFailure(): void {
  getBucket().failureCount += 1;
}

export function recordWordPressRetry(): void {
  getBucket().retryCount += 1;
}

export function recordWordPressDuplicatePrevented(): void {
  getBucket().duplicatePreventedCount += 1;
}

export function recordWordPressApprovalWait(): void {
  getBucket().approvalWaitCount += 1;
}

export function recordWordPressMediaFailure(): void {
  getBucket().mediaFailureCount += 1;
}

export function recordWordPressVerificationFailure(): void {
  getBucket().verificationFailureCount += 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function getWordPressAdapterMetrics(): WordPressAdapterMetricsSnapshot {
  const bucket = getBucket();
  const total = bucket.successCount + bucket.failureCount;
  const latencies = [...bucket.latenciesMs].sort((a, b) => a - b);
  const averageLatencyMs =
    latencies.length === 0
      ? 0
      : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const ops = bucket.draftCount + bucket.publishCount + bucket.updateCount;
  return {
    draftCount: bucket.draftCount,
    publishCount: bucket.publishCount,
    updateCount: bucket.updateCount,
    successRate: total === 0 ? 0 : bucket.successCount / total,
    failureRate: total === 0 ? 0 : bucket.failureCount / total,
    averageLatencyMs,
    p95LatencyMs: percentile(latencies, 95),
    retryRate: ops === 0 ? 0 : bucket.retryCount / ops,
    duplicatePreventedCount: bucket.duplicatePreventedCount,
    approvalWaitCount: bucket.approvalWaitCount,
    mediaFailureCount: bucket.mediaFailureCount,
    verificationFailureCount: bucket.verificationFailureCount,
    latenciesMs: latencies,
  };
}
