import type { LatencyStats, MeasuredRate } from "@/lib/quality-assurance/types";

export function unmeasuredRate(source: string): MeasuredRate {
  return {
    rate: null,
    success: 0,
    failure: 0,
    total: 0,
    measured: false,
    source,
  };
}

export function measuredRate(
  success: number,
  failure: number,
  source: string
): MeasuredRate {
  const total = success + failure;
  if (total <= 0) return unmeasuredRate(source);
  return {
    rate: success / total,
    success,
    failure,
    total,
    measured: true,
    source,
  };
}

/** Rate from a count over a denominator (e.g. timeout / attempts). */
export function ratioRate(
  numerator: number,
  denominator: number,
  source: string
): MeasuredRate {
  if (denominator <= 0) return unmeasuredRate(source);
  return {
    rate: numerator / denominator,
    success: Math.max(0, denominator - numerator),
    failure: numerator,
    total: denominator,
    measured: true,
    source,
  };
}

export function unmeasuredLatency(source: string): LatencyStats {
  return {
    avgMs: null,
    p95Ms: null,
    sampleCount: 0,
    measured: false,
    source,
  };
}

export function measuredLatency(
  avgMs: number | null,
  p95Ms: number | null,
  sampleCount: number,
  source: string
): LatencyStats {
  if (sampleCount <= 0 || avgMs == null) return unmeasuredLatency(source);
  return {
    avgMs,
    p95Ms,
    sampleCount,
    measured: true,
    source,
  };
}

export function formatRatePct(rate: MeasuredRate | null | undefined): string {
  if (!rate || !rate.measured || rate.rate == null) return "未計測";
  return `${(rate.rate * 100).toFixed(2)}% (n=${rate.total})`;
}
