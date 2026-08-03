import type { DropboxAdapterMetricsSnapshot } from "./types";

type MetricsBucket = {
  uploadCount: number;
  uploadSuccessCount: number;
  uploadFailureCount: number;
  retryCount: number;
  tokenRefreshCount: number;
  duplicatePreventedCount: number;
  scopeErrorCount: number;
  permissionErrorCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};

function getBucket(): MetricsBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDropboxLiveMetrics?: MetricsBucket;
  };
  if (!scope.__atlasDropboxLiveMetrics) {
    scope.__atlasDropboxLiveMetrics = {
      uploadCount: 0,
      uploadSuccessCount: 0,
      uploadFailureCount: 0,
      retryCount: 0,
      tokenRefreshCount: 0,
      duplicatePreventedCount: 0,
      scopeErrorCount: 0,
      permissionErrorCount: 0,
      verificationFailureCount: 0,
      latenciesMs: [],
    };
  }
  return scope.__atlasDropboxLiveMetrics;
}

export function resetDropboxLiveMetrics(): void {
  const bucket = getBucket();
  bucket.uploadCount = 0;
  bucket.uploadSuccessCount = 0;
  bucket.uploadFailureCount = 0;
  bucket.retryCount = 0;
  bucket.tokenRefreshCount = 0;
  bucket.duplicatePreventedCount = 0;
  bucket.scopeErrorCount = 0;
  bucket.permissionErrorCount = 0;
  bucket.verificationFailureCount = 0;
  bucket.latenciesMs = [];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export function recordDropboxUploadAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.uploadCount += 1;
  bucket.latenciesMs.push(Math.max(0, Math.round(latencyMs)));
}

export function recordDropboxUploadSuccess(): void {
  getBucket().uploadSuccessCount += 1;
}

export function recordDropboxUploadFailure(): void {
  getBucket().uploadFailureCount += 1;
}

export function recordDropboxRetry(): void {
  getBucket().retryCount += 1;
}

export function recordDropboxTokenRefresh(): void {
  getBucket().tokenRefreshCount += 1;
}

export function recordDropboxDuplicatePrevented(): void {
  getBucket().duplicatePreventedCount += 1;
}

export function recordDropboxScopeError(): void {
  getBucket().scopeErrorCount += 1;
}

export function recordDropboxPermissionError(): void {
  getBucket().permissionErrorCount += 1;
}

export function recordDropboxVerificationFailure(): void {
  getBucket().verificationFailureCount += 1;
}

export function getDropboxLiveMetrics(): DropboxAdapterMetricsSnapshot {
  const bucket = getBucket();
  const uploadCount = bucket.uploadCount;
  const success = bucket.uploadSuccessCount;
  const failure = bucket.uploadFailureCount;
  const avg =
    bucket.latenciesMs.length === 0
      ? 0
      : bucket.latenciesMs.reduce((sum, value) => sum + value, 0) /
        bucket.latenciesMs.length;

  return {
    uploadCount,
    uploadSuccessCount: success,
    uploadFailureCount: failure,
    uploadSuccessRate: uploadCount === 0 ? 0 : success / uploadCount,
    uploadFailureRate: uploadCount === 0 ? 0 : failure / uploadCount,
    averageLatencyMs: Math.round(avg),
    p95LatencyMs: percentile(bucket.latenciesMs, 95),
    retryRate: uploadCount === 0 ? 0 : bucket.retryCount / uploadCount,
    tokenRefreshCount: bucket.tokenRefreshCount,
    tokenRefreshRate:
      uploadCount === 0 ? 0 : bucket.tokenRefreshCount / uploadCount,
    duplicatePreventedCount: bucket.duplicatePreventedCount,
    scopeErrorCount: bucket.scopeErrorCount,
    permissionErrorCount: bucket.permissionErrorCount,
    verificationFailureCount: bucket.verificationFailureCount,
    latenciesMs: [...bucket.latenciesMs],
  };
}
