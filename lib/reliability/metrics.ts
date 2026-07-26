import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

/**
 * Reliability counters (in-process + durable events).
 * Unmeasured rates must be scored as 0 by reviewers.
 */

export type ReliabilityMetricKey =
  | "deliverable_generate"
  | "deliverable_download"
  | "export_pdf"
  | "export_word"
  | "export_excel"
  | "post_x"
  | "notification_ack"
  | "work_job"
  | "retry"
  | "recovery"
  | "timeout";

export type ReliabilityMetricBucket = {
  success: number;
  failure: number;
  retry: number;
  timeout: number;
  durationSumMs: number;
  durationCount: number;
};

export type ReliabilityWindow = 7 | 30 | 90;

type MetricsState = {
  startedAt: string;
  buckets: Record<ReliabilityMetricKey, ReliabilityMetricBucket>;
  recentFailures: Array<{
    key: ReliabilityMetricKey;
    message: string;
    at: string;
  }>;
  recentRetries: Array<{
    key: ReliabilityMetricKey;
    at: string;
  }>;
};

const METRIC_KEYS: ReliabilityMetricKey[] = [
  "deliverable_generate",
  "deliverable_download",
  "export_pdf",
  "export_word",
  "export_excel",
  "post_x",
  "notification_ack",
  "work_job",
  "retry",
  "recovery",
  "timeout",
];

function emptyBucket(): ReliabilityMetricBucket {
  return {
    success: 0,
    failure: 0,
    retry: 0,
    timeout: 0,
    durationSumMs: 0,
    durationCount: 0,
  };
}

function getState(): MetricsState {
  const g = globalThis as typeof globalThis & {
    __atlasReliabilityMetrics?: MetricsState;
  };
  if (!g.__atlasReliabilityMetrics) {
    const buckets = {} as Record<ReliabilityMetricKey, ReliabilityMetricBucket>;
    for (const key of METRIC_KEYS) buckets[key] = emptyBucket();
    g.__atlasReliabilityMetrics = {
      startedAt: new Date().toISOString(),
      buckets,
      recentFailures: [],
      recentRetries: [],
    };
  }
  // Backfill newer keys if process already had older state.
  for (const key of METRIC_KEYS) {
    if (!g.__atlasReliabilityMetrics.buckets[key]) {
      g.__atlasReliabilityMetrics.buckets[key] = emptyBucket();
    }
  }
  return g.__atlasReliabilityMetrics;
}

export type RecordReliabilityOptions = {
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export function recordReliabilityEvent(
  key: ReliabilityMetricKey,
  outcome: keyof Pick<
    ReliabilityMetricBucket,
    "success" | "failure" | "retry" | "timeout"
  >,
  count = 1,
  options: RecordReliabilityOptions = {},
): void {
  const state = getState();
  state.buckets[key][outcome] += count;
  if (typeof options.durationMs === "number" && options.durationMs >= 0) {
    state.buckets[key].durationSumMs += options.durationMs * count;
    state.buckets[key].durationCount += count;
  }
  if (outcome === "failure") {
    state.recentFailures.unshift({
      key,
      message: options.errorMessage ?? options.errorCode ?? "failure",
      at: new Date().toISOString(),
    });
    state.recentFailures = state.recentFailures.slice(0, 100);
  }
  if (outcome === "retry") {
    state.recentRetries.unshift({
      key,
      at: new Date().toISOString(),
    });
    state.recentRetries = state.recentRetries.slice(0, 100);
  }

  // Durable append (best-effort; never block hot path).
  void persistReliabilityEvent(key, outcome, options);
}

async function persistReliabilityEvent(
  key: ReliabilityMetricKey,
  outcome: string,
  options: RecordReliabilityOptions,
): Promise<void> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    const { error } = await client.from("atlas_reliability_events").insert({
      metric_key: key,
      outcome,
      duration_ms: options.durationMs ?? null,
      error_code: options.errorCode ?? null,
      error_message: options.errorMessage ?? null,
      metadata: options.metadata ?? {},
    } as never);
    if (error) {
      console.warn("[atlas_reliability_events] insert failed", error.message);
    }
  } catch (error) {
    console.warn("[atlas_reliability_events] insert error", error);
  }
}

export function reliabilitySuccessRate(key: ReliabilityMetricKey): number | null {
  const b = getState().buckets[key];
  const total = b.success + b.failure;
  if (total === 0) return null;
  return b.success / total;
}

function rateFromCounts(success: number, failure: number): number | null {
  const total = success + failure;
  if (total === 0) return null;
  return success / total;
}

export function getReliabilityMetricsSnapshot(): {
  startedAt: string;
  rates: Record<ReliabilityMetricKey, number | null>;
  buckets: MetricsState["buckets"];
  avgDurationMs: Record<ReliabilityMetricKey, number | null>;
  recentFailures: MetricsState["recentFailures"];
  recentRetries: MetricsState["recentRetries"];
} {
  const state = getState();
  const rates = {} as Record<ReliabilityMetricKey, number | null>;
  const avgDurationMs = {} as Record<ReliabilityMetricKey, number | null>;
  for (const key of METRIC_KEYS) {
    rates[key] = reliabilitySuccessRate(key);
    const b = state.buckets[key];
    avgDurationMs[key] =
      b.durationCount > 0 ? b.durationSumMs / b.durationCount : null;
  }
  return {
    startedAt: state.startedAt,
    rates,
    buckets: structuredClone(state.buckets),
    avgDurationMs,
    recentFailures: structuredClone(state.recentFailures),
    recentRetries: structuredClone(state.recentRetries),
  };
}

export type WindowMetrics = {
  windowDays: ReliabilityWindow;
  buckets: Record<string, ReliabilityMetricBucket>;
  rates: Record<string, number | null>;
  avgDurationMs: Record<string, number | null>;
};

export async function getReliabilityWindowMetrics(
  windows: ReliabilityWindow[] = [7, 30, 90],
): Promise<WindowMetrics[]> {
  const client = createServiceRoleClientIfConfigured();
  const results: WindowMetrics[] = [];

  for (const days of windows) {
    const buckets: Record<string, ReliabilityMetricBucket> = {};
    for (const key of METRIC_KEYS) buckets[key] = emptyBucket();

    if (client) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      try {
        const { data, error } = await client
          .from("atlas_reliability_events")
          .select("metric_key, outcome, duration_ms")
          .gte("created_at", since)
          .limit(50_000);
        if (!error && data) {
          for (const row of data as Array<{
            metric_key: string;
            outcome: string;
            duration_ms: number | null;
          }>) {
            const key = row.metric_key;
            if (!buckets[key]) buckets[key] = emptyBucket();
            const outcome = row.outcome as keyof ReliabilityMetricBucket;
            if (
              outcome === "success" ||
              outcome === "failure" ||
              outcome === "retry" ||
              outcome === "timeout"
            ) {
              buckets[key][outcome] += 1;
            }
            if (typeof row.duration_ms === "number") {
              buckets[key].durationSumMs += row.duration_ms;
              buckets[key].durationCount += 1;
            }
          }
        }
      } catch (error) {
        console.warn("[atlas_reliability_events] window query failed", error);
      }
    } else {
      // No Supabase → expose in-process as the only measurable window.
      const snap = getReliabilityMetricsSnapshot();
      for (const key of METRIC_KEYS) {
        buckets[key] = { ...snap.buckets[key] };
      }
    }

    const rates: Record<string, number | null> = {};
    const avgDurationMs: Record<string, number | null> = {};
    for (const [key, b] of Object.entries(buckets)) {
      rates[key] = rateFromCounts(b.success, b.failure);
      avgDurationMs[key] =
        b.durationCount > 0 ? b.durationSumMs / b.durationCount : null;
    }
    results.push({ windowDays: days, buckets, rates, avgDurationMs });
  }

  return results;
}

export function resetReliabilityMetricsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasReliabilityMetrics?: MetricsState;
  };
  g.__atlasReliabilityMetrics = undefined;
}
