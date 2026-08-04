/**
 * In-process Word pipeline metrics for owner diagnostics (24h window).
 * No document bodies or PII — counters and stage labels only.
 */

export type WordMetricKey =
  | "request"
  | "success"
  | "failure"
  | "retry"
  | "recovery_success"
  | "storage_failure"
  | "ai_content_failure"
  | "word_convert_failure"
  | "verify_failure"
  | "download_failure"
  | "download_success"
  | "dedupe_hit"
  | "generate_ms"
  | "persist_ms"
  | "download_ms"
  | "purpose_ms"
  | "model_ms"
  | "docx_ms"
  | "verify_ms"
  | "save_ms"
  | "notify_ms"
  | "total_ms";

type Sample = { at: number; value: number };
type Event = { at: number; stage: string; message: string };

type MetricsBucket = {
  counters: Map<WordMetricKey, Sample[]>;
  lastErrorStage: string | null;
  lastErrorAt: string | null;
  recentErrors: Event[];
};

const WINDOW_MS = 1000 * 60 * 60 * 24;

function getBucket(): MetricsBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasWordMetrics?: MetricsBucket;
  };
  if (!scope.__atlasWordMetrics) {
    scope.__atlasWordMetrics = {
      counters: new Map(),
      lastErrorStage: null,
      lastErrorAt: null,
      recentErrors: [],
    };
  }
  return scope.__atlasWordMetrics;
}

function prune(samples: Sample[]): Sample[] {
  const cutoff = Date.now() - WINDOW_MS;
  return samples.filter((s) => s.at >= cutoff);
}

export function resetWordMetricsForTests(): void {
  const bucket = getBucket();
  bucket.counters.clear();
  bucket.lastErrorStage = null;
  bucket.lastErrorAt = null;
  bucket.recentErrors = [];
}

export function recordWordMetric(
  key: WordMetricKey,
  value = 1,
  meta?: { stage?: string; message?: string },
): void {
  const bucket = getBucket();
  const list = prune(bucket.counters.get(key) ?? []);
  list.push({ at: Date.now(), value });
  bucket.counters.set(key, list);

  if (
    key === "failure" ||
    key === "storage_failure" ||
    key === "ai_content_failure" ||
    key === "word_convert_failure" ||
    key === "verify_failure" ||
    key === "download_failure"
  ) {
    bucket.lastErrorStage = meta?.stage ?? key;
    bucket.lastErrorAt = new Date().toISOString();
    bucket.recentErrors = [
      {
        at: Date.now(),
        stage: meta?.stage ?? key,
        message: (meta?.message ?? key).slice(0, 200),
      },
      ...bucket.recentErrors,
    ].slice(0, 20);
  }
}

function sum(key: WordMetricKey): number {
  const list = prune(getBucket().counters.get(key) ?? []);
  getBucket().counters.set(key, list);
  return list.reduce((acc, s) => acc + s.value, 0);
}

function avg(key: WordMetricKey): number | null {
  const list = prune(getBucket().counters.get(key) ?? []);
  getBucket().counters.set(key, list);
  if (list.length === 0) return null;
  return list.reduce((acc, s) => acc + s.value, 0) / list.length;
}

function percentile(key: WordMetricKey, p: number): number | null {
  const list = prune(getBucket().counters.get(key) ?? []);
  getBucket().counters.set(key, list);
  if (list.length === 0) return null;
  const sorted = [...list.map((s) => s.value)].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

function extreme(key: WordMetricKey, mode: "min" | "max"): number | null {
  const list = prune(getBucket().counters.get(key) ?? []);
  getBucket().counters.set(key, list);
  if (list.length === 0) return null;
  const values = list.map((s) => s.value);
  return mode === "min" ? Math.min(...values) : Math.max(...values);
}

export type WordMetricsSnapshot = {
  windowHours: 24;
  requests: number;
  successes: number;
  failures: number;
  successRate: number | null;
  failureRate: number | null;
  avgGenerateMs: number | null;
  medianGenerateMs: number | null;
  p90GenerateMs: number | null;
  p95GenerateMs: number | null;
  p99GenerateMs: number | null;
  minGenerateMs: number | null;
  maxGenerateMs: number | null;
  avgPersistMs: number | null;
  avgDownloadMs: number | null;
  avgPurposeMs: number | null;
  avgModelMs: number | null;
  avgDocxMs: number | null;
  avgVerifyMs: number | null;
  avgSaveMs: number | null;
  avgNotifyMs: number | null;
  retries: number;
  retryRate: number | null;
  recoverySuccesses: number;
  storageFailures: number;
  aiContentFailures: number;
  wordConvertFailures: number;
  verifyFailures: number;
  downloadFailures: number;
  downloadSuccesses: number;
  dedupeHits: number;
  lastErrorStage: string | null;
  lastErrorAt: string | null;
};

export function getWordMetricsSnapshot(): WordMetricsSnapshot {
  const bucket = getBucket();
  const successes = sum("success");
  const failures =
    sum("failure") +
    sum("storage_failure") +
    sum("ai_content_failure") +
    sum("word_convert_failure") +
    sum("verify_failure");
  const requests = sum("request") || successes + failures;
  const retries = sum("retry");

  return {
    windowHours: 24,
    requests,
    successes,
    failures,
    successRate:
      successes + failures > 0 ? successes / (successes + failures) : null,
    failureRate:
      successes + failures > 0 ? failures / (successes + failures) : null,
    avgGenerateMs: avg("generate_ms"),
    medianGenerateMs: percentile("generate_ms", 50),
    p90GenerateMs: percentile("generate_ms", 90),
    p95GenerateMs: percentile("generate_ms", 95),
    p99GenerateMs: percentile("generate_ms", 99),
    minGenerateMs: extreme("generate_ms", "min"),
    maxGenerateMs: extreme("generate_ms", "max"),
    avgPersistMs: avg("persist_ms"),
    avgDownloadMs: avg("download_ms"),
    avgPurposeMs: avg("purpose_ms"),
    avgModelMs: avg("model_ms"),
    avgDocxMs: avg("docx_ms"),
    avgVerifyMs: avg("verify_ms"),
    avgSaveMs: avg("save_ms"),
    avgNotifyMs: avg("notify_ms"),
    retries,
    retryRate: requests > 0 ? retries / requests : null,
    recoverySuccesses: sum("recovery_success"),
    storageFailures: sum("storage_failure"),
    aiContentFailures: sum("ai_content_failure"),
    wordConvertFailures: sum("word_convert_failure"),
    verifyFailures: sum("verify_failure"),
    downloadFailures: sum("download_failure"),
    downloadSuccesses: sum("download_success"),
    dedupeHits: sum("dedupe_hit"),
    lastErrorStage: bucket.lastErrorStage,
    lastErrorAt: bucket.lastErrorAt,
  };
}
