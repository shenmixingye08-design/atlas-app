"use client";

import { useEffect, useState } from "react";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import type { QualityMetrics } from "@/lib/personalization/types";

/**
 * Owner / evaluation dashboard — measured metrics only.
 * Never shows estimated hours saved as fact.
 */
export function MemoryQualityDashboard() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return scheduleMountWork(() => {
      void fetch("/api/personalization?view=metrics")
        .then(async (res) => {
          if (!res.ok) throw new Error("指標の取得に失敗しました");
          return res.json() as Promise<{ metrics: QualityMetrics }>;
        })
        .then((json) => setMetrics(json.metrics))
        .catch((err: Error) => setError(err.message));
    });
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!metrics) {
    return <p className="text-sm text-[var(--atlas-muted)]">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Memory 品質（実測）</h2>
      <p className="text-xs text-[var(--atlas-muted)]">
        kind=measured · n={metrics.sampleSize} · 推定削減時間は表示しません
      </p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        <li>Memory適用率: {pct(metrics.memoryApplicationRate)}</li>
        <li>First Accept Rate: {pct(metrics.firstAcceptRate)}</li>
        <li>Diff（平均）: {pct(metrics.normalizedDiffRate)}</li>
        <li>Instruction Reduction: {pct(metrics.instructionReductionRate)}</li>
        <li>False Application Rate: {pct(metrics.falseApplicationRate)}</li>
        <li>Revision Rate: {pct(metrics.revisionRate)}</li>
        <li>Conflict Rate: {pct(metrics.conflictRate)}</li>
        <li>Override Rate: {pct(metrics.overrideRate)}</li>
      </ul>
    </section>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
