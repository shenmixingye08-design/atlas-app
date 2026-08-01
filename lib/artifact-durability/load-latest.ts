import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { DEFAULT_ARTIFACT_DURABILITY_OUT } from "@/lib/artifact-durability/run-suite";
import type { ArtifactDurabilityAggregate } from "@/lib/artifact-durability/types";
import {
  measuredLatency,
  measuredRate,
  unmeasuredRate,
} from "@/lib/quality-assurance/rates";
import type { LatencyStats, MeasuredRate } from "@/lib/quality-assurance/types";

export type LatestArtifactDurability = {
  suiteId: string;
  reportPath?: string;
  phase2Pass: boolean;
  totals?: Record<
    string,
    { n: number; finalRate: number | null; p95Ms: number | null }
  >;
  aggregate?: ArtifactDurabilityAggregate;
};

export function loadLatestArtifactDurability(
  root = DEFAULT_ARTIFACT_DURABILITY_OUT
): LatestArtifactDurability | null {
  const latestPath = join(root, "latest.json");
  if (!existsSync(latestPath)) return null;
  try {
    const latest = JSON.parse(
      readFileSync(latestPath, "utf8")
    ) as LatestArtifactDurability;
    if (latest.suiteId) {
      const aggPath = join(root, latest.suiteId, "aggregate.json");
      if (existsSync(aggPath)) {
        latest.aggregate = JSON.parse(
          readFileSync(aggPath, "utf8")
        ) as ArtifactDurabilityAggregate;
      }
    }
    return latest;
  } catch {
    return null;
  }
}

export function artifactRatesFromPhase2(latest: LatestArtifactDurability | null): {
  wordFinal: MeasuredRate;
  excelFinal: MeasuredRate;
  pdfFinal: MeasuredRate;
  pptxFinal: MeasuredRate;
  latency: Record<string, LatencyStats>;
} {
  const agg = latest?.aggregate;
  if (!agg || agg.totalCases <= 0) {
    const missing = unmeasuredRate("artifact-durability:missing");
    return {
      wordFinal: missing,
      excelFinal: missing,
      pdfFinal: missing,
      pptxFinal: missing,
      latency: {},
    };
  }

  const toRate = (f: "docx" | "xlsx" | "pdf" | "pptx") => {
    const row = agg.byFormat[f];
    return measuredRate(
      row.finalSuccess,
      Math.max(0, row.total - row.finalSuccess),
      `artifact-durability:${f}`
    );
  };

  const latency: Record<string, LatencyStats> = {};
  for (const f of ["docx", "xlsx", "pdf", "pptx"] as const) {
    const row = agg.byFormat[f];
    latency[f] = measuredLatency(
      row.avgMs,
      row.p95Ms,
      row.total,
      `artifact-durability:${f}:p95`
    );
  }

  return {
    wordFinal: toRate("docx"),
    excelFinal: toRate("xlsx"),
    pdfFinal: toRate("pdf"),
    pptxFinal: toRate("pptx"),
    latency,
  };
}
