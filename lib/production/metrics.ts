import os from "node:os";

/**
 * Production metrics registry — process + latency + counters.
 * Complements lib/reliability/metrics without replacing it.
 */

export type LatencySample = {
  name: string;
  ms: number;
  at: string;
};

export type ProductionGaugeSnapshot = {
  cpuLoad1m: number | null;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryUsagePercent: number;
  heapUsedMb: number;
  uptimeSec: number;
  eventLoopLagMs: number | null;
};

export type ProductionCounterSnapshot = {
  requests: number;
  failures: number;
  retries: number;
  queueDepth: number;
  workerRunning: number;
  storageErrors: number;
  openaiErrors: number;
  dbErrors: number;
  notificationFailures: number;
  schedulerStops: number;
};

export type LatencyPercentiles = {
  name: string;
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
};

type MemoryScope = typeof globalThis & {
  __atlasProductionMetrics?: {
    counters: ProductionCounterSnapshot;
    latency: LatencySample[];
    lastEventLoopCheckAt: number;
    lastEventLoopLagMs: number | null;
  };
};

function state() {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasProductionMetrics) {
    scope.__atlasProductionMetrics = {
      counters: {
        requests: 0,
        failures: 0,
        retries: 0,
        queueDepth: 0,
        workerRunning: 0,
        storageErrors: 0,
        openaiErrors: 0,
        dbErrors: 0,
        notificationFailures: 0,
        schedulerStops: 0,
      },
      latency: [],
      lastEventLoopCheckAt: Date.now(),
      lastEventLoopLagMs: null,
    };
  }
  return scope.__atlasProductionMetrics;
}

export function incrementProductionCounter(
  key: keyof ProductionCounterSnapshot,
  by = 1,
): void {
  state().counters[key] += by;
}

export function setProductionGaugeCounter(
  key: "queueDepth" | "workerRunning",
  value: number,
): void {
  state().counters[key] = Math.max(0, Math.floor(value));
}

export function recordLatency(name: string, ms: number): void {
  const samples = state().latency;
  samples.push({ name, ms: Math.max(0, ms), at: new Date().toISOString() });
  if (samples.length > 2000) samples.splice(0, samples.length - 2000);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export function getLatencyPercentiles(
  name?: string,
): LatencyPercentiles | LatencyPercentiles[] {
  const samples = state().latency;
  const names = name
    ? [name]
    : [...new Set(samples.map((s) => s.name))];
  const result = names.map((n) => {
    const values = samples
      .filter((s) => s.name === n)
      .map((s) => s.ms)
      .sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      name: n,
      count: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      avg: values.length ? Math.round((sum / values.length) * 100) / 100 : null,
    };
  });
  return name ? result[0]! : result;
}

export function sampleProcessGauges(): ProductionGaugeSnapshot {
  const mem = process.memoryUsage();
  const total =
    typeof process.memoryUsage.rss === "function"
      ? mem.rss
      : mem.heapTotal + mem.external;
  const usedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
  const totalMb = Math.round((total / (1024 * 1024)) * 10) / 10;
  let cpuLoad1m: number | null = null;
  try {
    cpuLoad1m = os.loadavg()?.[0] ?? null;
  } catch {
    cpuLoad1m = null;
  }

  // Cheap event-loop lag sample
  const started = Date.now();
  const expected = state().lastEventLoopCheckAt + 0;
  state().lastEventLoopCheckAt = started;
  const lag = Math.max(0, started - expected);
  state().lastEventLoopLagMs = lag > 50 ? lag : state().lastEventLoopLagMs;

  return {
    cpuLoad1m,
    memoryUsedMb: usedMb,
    memoryTotalMb: totalMb,
    memoryUsagePercent:
      totalMb > 0 ? Math.round((usedMb / totalMb) * 1000) / 10 : 0,
    heapUsedMb: usedMb,
    uptimeSec: Math.round(process.uptime()),
    eventLoopLagMs: state().lastEventLoopLagMs,
  };
}

export function getProductionCounters(): ProductionCounterSnapshot {
  return { ...state().counters };
}

export function resetProductionMetricsForTests(): void {
  (globalThis as MemoryScope).__atlasProductionMetrics = undefined;
}
