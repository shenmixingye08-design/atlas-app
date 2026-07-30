import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

/**
 * Reliability counters (in-process + durable events).
 * Unmeasured rates must be scored as 0 by reviewers.
 *
 * Durable rows never store secrets, tokens, or image/binary bodies.
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

export type ReliabilitySeverity = "info" | "warn" | "error" | "critical";

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

const SENSITIVE_KEY =
  /^(authorization|cookie|token|password|secret|api[_-]?key|private[_-]?key|content_base64|image(_data|_base64)?|data_url|raw_image)$/i;

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

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") {
      // Cap string fields; never persist image/data URLs.
      if (/^data:image\//i.test(value) || value.length > 2000) {
        out[key] = `[omitted:${Math.min(value.length, 999999)}chars]`;
        continue;
      }
      out[key] = value.slice(0, 500);
      continue;
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) =>
        typeof item === "string" ? item.slice(0, 200) : item,
      );
      continue;
    }
    if (typeof value === "object") {
      out[key] = sanitizeMetadata(value as Record<string, unknown>);
    }
  }
  return out;
}

function safeMessage(message: string | undefined | null): string | null {
  if (!message) return null;
  return message
    .replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .slice(0, 500);
}

export type RecordReliabilityOptions = {
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  /** Alias of errorMessage — stored as both `message` and `error_message`. */
  message?: string;
  jobId?: string | null;
  diagnosticId?: string | null;
  userId?: string | null;
  stage?: string | null;
  severity?: ReliabilitySeverity | null;
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
  const message =
    safeMessage(options.message ?? options.errorMessage) ??
    options.errorCode ??
    "failure";
  if (outcome === "failure") {
    state.recentFailures.unshift({
      key,
      message,
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
  const message = safeMessage(options.message ?? options.errorMessage);
  const metadata = sanitizeMetadata({
    ...(options.metadata ?? {}),
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.diagnosticId ? { diagnosticId: options.diagnosticId } : {}),
    ...(options.stage ? { stage: options.stage } : {}),
  });

  // Always emit a structured console line so Vercel shows the real failure
  // even when the diagnostics table is missing.
  if (outcome === "failure" || outcome === "timeout") {
    console.error("[atlas_reliability_events] diagnostic", {
      metric_key: key,
      outcome,
      job_id: options.jobId ?? null,
      diagnostic_id: options.diagnosticId ?? null,
      user_id: options.userId ? "[present]" : null,
      stage: options.stage ?? null,
      severity:
        options.severity ??
        (outcome === "timeout" ? "error" : "error"),
      error_code: options.errorCode ?? null,
      message,
      metadata,
    });
  }

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      console.warn(
        "[atlas_reliability_events] insert skipped: supabase service role not configured",
      );
      return;
    }
    const severity =
      options.severity ??
      (outcome === "success"
        ? "info"
        : outcome === "retry"
          ? "warn"
          : "error");
    const { error } = await client.from("atlas_reliability_events").insert({
      metric_key: key,
      outcome,
      duration_ms: options.durationMs ?? null,
      job_id: options.jobId ?? null,
      diagnostic_id: options.diagnosticId ?? null,
      user_id: options.userId ?? null,
      stage: options.stage ?? null,
      severity,
      error_code: options.errorCode ?? null,
      message,
      error_message: message,
      metadata,
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
            metric_key: string | null;
            outcome: string | null;
            duration_ms: number | null;
          }>) {
            const key = row.metric_key ?? "work_job";
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
