import type { DriveAdapterMetricsSnapshot } from "./types";

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
    __atlasGoogleDriveLiveMetrics?: MetricsBucket;
  };
  if (!scope.__atlasGoogleDriveLiveMetrics) {
    scope.__atlasGoogleDriveLiveMetrics = {
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
  return scope.__atlasGoogleDriveLiveMetrics;
}

export function resetGoogleDriveLiveMetrics(): void {
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

export function recordDriveUploadAttempt(latencyMs: number): void {
  const bucket = getBucket();
  bucket.uploadCount += 1;
  bucket.latenciesMs.push(Math.max(0, Math.round(latencyMs)));
}

export function recordDriveUploadSuccess(): void {
  getBucket().uploadSuccessCount += 1;
}

export function recordDriveUploadFailure(): void {
  getBucket().uploadFailureCount += 1;
}

export function recordDriveRetry(): void {
  getBucket().retryCount += 1;
}

export function recordDriveTokenRefresh(): void {
  getBucket().tokenRefreshCount += 1;
}

export function recordDriveDuplicatePrevented(): void {
  getBucket().duplicatePreventedCount += 1;
}

export function recordDriveScopeError(): void {
  getBucket().scopeErrorCount += 1;
}

export function recordDrivePermissionError(): void {
  getBucket().permissionErrorCount += 1;
}

export function recordDriveVerificationFailure(): void {
  getBucket().verificationFailureCount += 1;
}

export function getGoogleDriveLiveMetrics(): DriveAdapterMetricsSnapshot {
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
