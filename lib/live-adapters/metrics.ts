import type {
  AdapterHealthSnapshot,
  AdapterMetricSample,
  AdapterRuntimeMode,
  IntegrationService,
} from "./types";

type Scope = typeof globalThis & {
  __atlasLiveAdapterMetrics?: AdapterMetricSample[];
};

const MAX = 2_000;

function samples(): AdapterMetricSample[] {
  const scope = globalThis as Scope;
  if (!scope.__atlasLiveAdapterMetrics) scope.__atlasLiveAdapterMetrics = [];
  return scope.__atlasLiveAdapterMetrics;
}

export function recordAdapterMetric(sample: AdapterMetricSample): void {
  const rows = samples();
  rows.unshift(sample);
  if (rows.length > MAX) rows.length = MAX;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function buildAdapterHealth(
  service: IntegrationService,
  meta: {
    mode: AdapterRuntimeMode;
    registered: boolean;
    configured: boolean;
    classification: AdapterHealthSnapshot["classification"];
    availability: AdapterHealthSnapshot["availability"];
  },
): AdapterHealthSnapshot {
  const rows = samples().filter((s) => s.service === service);
  const successes = rows.filter((r) => r.ok).length;
  const retries = rows.filter((r) => r.retryable).length;
  const rateLimited = rows.filter((r) => r.statusCodeHint === 429).length;
  const authFails = rows.filter(
    (r) =>
      r.errorCode === "token_revoked_or_unauthorized" ||
      r.errorCode === "permission_denied",
  ).length;
  const latencies = rows.map((r) => r.latencyMs);
  const lastSuccess = rows.find((r) => r.ok)?.at ?? null;
  const lastFailure = rows.find((r) => !r.ok)?.at ?? null;

  return {
    service,
    mode: meta.mode,
    registered: meta.registered,
    configured: meta.configured,
    classification: meta.classification,
    availability: meta.availability,
    successRate: rows.length === 0 ? null : successes / rows.length,
    averageLatencyMs:
      latencies.length === 0
        ? null
        : latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p95LatencyMs: percentile(latencies, 95),
    retryRate: rows.length === 0 ? null : retries / rows.length,
    rateLimit429Rate: rows.length === 0 ? null : rateLimited / rows.length,
    authFailureCount: authFails,
    lastSuccessAt: lastSuccess,
    lastFailureAt: lastFailure,
    samples: rows.length,
  };
}

export function listAdapterMetricSamples(limit = 100): AdapterMetricSample[] {
  return samples().slice(0, limit);
}

export function resetLiveAdapterMetricsForTests(): void {
  (globalThis as Scope).__atlasLiveAdapterMetrics = [];
}
