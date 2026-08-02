import type {
  IntegrationCallMetric,
  IntegrationServiceId,
  IntegrationServiceMetrics,
} from "@/lib/integration-platform/types";

type Store = {
  calls: IntegrationCallMetric[];
};

function getStore(): Store {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationMetricsStore?: Store;
  };
  if (!g.__atlasIntegrationMetricsStore) {
    g.__atlasIntegrationMetricsStore = { calls: [] };
  }
  return g.__atlasIntegrationMetricsStore;
}

export function resetIntegrationMetricsForTests(): void {
  getStore().calls = [];
}

export function recordIntegrationCall(metric: IntegrationCallMetric): void {
  const store = getStore();
  store.calls.unshift(metric);
  store.calls = store.calls.slice(0, 5000);
}

export function listIntegrationCalls(
  filter?: { serviceId?: IntegrationServiceId; sandbox?: boolean },
): IntegrationCallMetric[] {
  return getStore()
    .calls.filter((row) => {
      if (filter?.serviceId && row.serviceId !== filter.serviceId) return false;
      if (filter?.sandbox != null && row.sandbox !== filter.sandbox) return false;
      return true;
    })
    .map((row) => structuredClone(row));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function computeServiceMetrics(
  serviceId: IntegrationServiceId,
  options?: { sandbox?: boolean },
): IntegrationServiceMetrics {
  const rows = listIntegrationCalls({
    serviceId,
    sandbox: options?.sandbox,
  });
  const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const success = rows.filter((r) => r.ok).length;
  const rateLimited = rows.filter((r) => r.statusCode === 429).length;
  const retried = rows.filter((r) => r.retried).length;
  const avg =
    durations.length === 0
      ? 0
      : durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    serviceId,
    sampleSize: rows.length,
    successRate: rows.length === 0 ? 0 : Number((success / rows.length).toFixed(4)),
    avgMs: Number(avg.toFixed(2)),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    rateLimit429Rate:
      rows.length === 0 ? 0 : Number((rateLimited / rows.length).toFixed(4)),
    retryRate: rows.length === 0 ? 0 : Number((retried / rows.length).toFixed(4)),
    failureRate:
      rows.length === 0
        ? 0
        : Number(((rows.length - success) / rows.length).toFixed(4)),
    kind: "measured",
    sandbox: options?.sandbox === true,
  };
}
