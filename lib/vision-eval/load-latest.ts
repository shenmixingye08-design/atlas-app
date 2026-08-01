import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { DEFAULT_VISION_EVAL_OUT } from "@/lib/vision-eval/run-suite";
import type { VisionEvalAggregate } from "@/lib/vision-eval/types";
import { measuredLatency, measuredRate, unmeasuredRate } from "@/lib/quality-assurance/rates";
import type { LatencyStats, MeasuredRate } from "@/lib/quality-assurance/types";

export type LatestVisionPhase1 = {
  suiteId: string;
  reportPath?: string;
  phase1Pass: boolean;
  visionSuccessRate: number | null;
  n: number;
  aggregate?: VisionEvalAggregate;
};

export function loadLatestVisionPhase1(
  root = DEFAULT_VISION_EVAL_OUT
): LatestVisionPhase1 | null {
  const latestPath = join(root, "latest.json");
  if (!existsSync(latestPath)) return null;
  try {
    const latest = JSON.parse(readFileSync(latestPath, "utf8")) as LatestVisionPhase1;
    if (latest.suiteId) {
      const aggPath = join(root, latest.suiteId, "aggregate.json");
      if (existsSync(aggPath)) {
        const parsed = JSON.parse(readFileSync(aggPath, "utf8")) as {
          aggregate?: VisionEvalAggregate;
        };
        latest.aggregate = parsed.aggregate;
      }
    }
    return latest;
  } catch {
    return null;
  }
}

export function visionRatesFromPhase1(latest: LatestVisionPhase1 | null): {
  visionSuccess: MeasuredRate;
  ocrSuccess: MeasuredRate;
  timeoutRate: MeasuredRate;
  latency: LatencyStats;
  p95Ms: number | null;
} {
  const agg = latest?.aggregate;
  if (!agg || agg.totalCases <= 0) {
    return {
      visionSuccess: unmeasuredRate("vision-phase1:missing"),
      ocrSuccess: unmeasuredRate("vision-phase1:missing"),
      timeoutRate: unmeasuredRate("vision-phase1:missing"),
      latency: {
        avgMs: null,
        p95Ms: null,
        sampleCount: 0,
        measured: false,
        source: "vision-phase1:missing",
      },
      p95Ms: null,
    };
  }

  // If all env_missing, keep measured=true with rate reflecting failures (honest 0%)
  const visionSuccess = measuredRate(
    agg.successCount,
    agg.failureCount,
    "vision-phase1:live"
  );
  const ocrSuccessCount = Math.round(
    (agg.ocrSuccessRate ?? 0) * agg.totalCases
  );
  const ocrSuccess = measuredRate(
    ocrSuccessCount,
    Math.max(0, agg.totalCases - ocrSuccessCount),
    "vision-phase1:ocr-embedded"
  );
  const timeoutCount = Math.round((agg.timeoutRate ?? 0) * agg.totalCases);
  const timeoutRate = measuredRate(
    Math.max(0, agg.totalCases - timeoutCount),
    timeoutCount,
    "vision-phase1:timeout"
  );

  return {
    visionSuccess,
    ocrSuccess,
    timeoutRate,
    latency: measuredLatency(
      agg.avgMs,
      agg.p95Ms,
      agg.totalCases,
      "vision-phase1:latency"
    ),
    p95Ms: agg.p95Ms,
  };
}
