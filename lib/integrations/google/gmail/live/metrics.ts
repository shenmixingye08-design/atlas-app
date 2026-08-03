import type { GmailAdapterMetricsSnapshot } from "./types";

type CounterBucket = {
  draftCount: number;
  sendCount: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  tokenRefreshCount: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  invalidRecipientCount: number;
  attachmentFailureCount: number;
  scopeErrorCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};

function getBucket(): CounterBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasGmailLiveMetrics?: CounterBucket;
  };
  if (!scope.__atlasGmailLiveMetrics) {
    scope.__atlasGmailLiveMetrics = {
      draftCount: 0,
      sendCount: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      tokenRefreshCount: 0,
      duplicatePreventedCount: 0,
      approvalWaitCount: 0,
      invalidRecipientCount: 0,
      attachmentFailureCount: 0,
      scopeErrorCount: 0,
      verificationFailureCount: 0,
      latenciesMs: [],
    };
  }
  return scope.__atlasGmailLiveMetrics;
}

export function resetGmailLiveMetricsForTests(): void {
  const bucket = getBucket();
  bucket.draftCount = 0;
  bucket.sendCount = 0;
  bucket.successCount = 0;
  bucket.failureCount = 0;
  bucket.retryCount = 0;
  bucket.tokenRefreshCount = 0;
  bucket.duplicatePreventedCount = 0;
  bucket.approvalWaitCount = 0;
  bucket.invalidRecipientCount = 0;
  bucket.attachmentFailureCount = 0;
  bucket.scopeErrorCount = 0;
  bucket.verificationFailureCount = 0;
  bucket.latenciesMs = [];
}

export function recordGmailDraftAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.draftCount += 1;
  bucket.latenciesMs.push(latencyMs);
}

export function recordGmailSendAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.sendCount += 1;
  bucket.latenciesMs.push(latencyMs);
}

export function recordGmailSuccess(): void {
  getBucket().successCount += 1;
}

export function recordGmailFailure(): void {
  getBucket().failureCount += 1;
}

export function recordGmailRetry(): void {
  getBucket().retryCount += 1;
}

export function recordGmailTokenRefresh(): void {
  getBucket().tokenRefreshCount += 1;
}

export function recordGmailDuplicatePrevented(): void {
  getBucket().duplicatePreventedCount += 1;
}

export function recordGmailApprovalWait(): void {
  getBucket().approvalWaitCount += 1;
}

export function recordGmailInvalidRecipient(): void {
  getBucket().invalidRecipientCount += 1;
}

export function recordGmailAttachmentFailure(): void {
  getBucket().attachmentFailureCount += 1;
}

export function recordGmailScopeError(): void {
  getBucket().scopeErrorCount += 1;
}

export function recordGmailVerificationFailure(): void {
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

export function getGmailAdapterMetrics(): GmailAdapterMetricsSnapshot {
  const bucket = getBucket();
  const total = bucket.successCount + bucket.failureCount;
  const latencies = [...bucket.latenciesMs].sort((a, b) => a - b);
  const averageLatencyMs =
    latencies.length === 0
      ? 0
      : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const ops = bucket.draftCount + bucket.sendCount;
  return {
    draftCount: bucket.draftCount,
    sendCount: bucket.sendCount,
    successRate: total === 0 ? 0 : bucket.successCount / total,
    failureRate: total === 0 ? 0 : bucket.failureCount / total,
    averageLatencyMs,
    p95LatencyMs: percentile(latencies, 95),
    retryRate: ops === 0 ? 0 : bucket.retryCount / ops,
    tokenRefreshRate: ops === 0 ? 0 : bucket.tokenRefreshCount / ops,
    duplicatePreventedCount: bucket.duplicatePreventedCount,
    approvalWaitCount: bucket.approvalWaitCount,
    invalidRecipientCount: bucket.invalidRecipientCount,
    attachmentFailureCount: bucket.attachmentFailureCount,
    scopeErrorCount: bucket.scopeErrorCount,
    verificationFailureCount: bucket.verificationFailureCount,
    latenciesMs: latencies,
  };
}
