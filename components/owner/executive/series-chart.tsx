import type { AnalyticsSeriesPoint } from "@/lib/owner/monitoring/types";
import { formatOwnerJpy } from "@/lib/owner/format";

export function ExecutiveSeriesChart({
  series,
  title = "推移",
}: {
  series: readonly AnalyticsSeriesPoint[];
  title?: string;
}) {
  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-3 text-sm text-[var(--text-muted)]">表示できる実データがありません。</p>
      </div>
    );
  }

  const maxAi = Math.max(...series.map((p) => p.aiRuns), 1);
  const maxRevenue = Math.max(...series.map((p) => p.revenueJpy), 1);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        AI実行・売上・API原価の実データ推移
      </p>
      <div className="mt-6 space-y-4">
        {series.map((point) => (
          <div key={point.key} className="space-y-2">
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{point.label}</span>
              <span className="text-[var(--text-muted)]">
                AI {point.aiRuns} · 売上 {formatOwnerJpy(point.revenueJpy)} · 原価{" "}
                {formatOwnerJpy(point.openAiCostJpy)}
              </span>
            </div>
            <div className="grid gap-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                  style={{ width: `${(point.aiRuns / maxAi) * 100}%` }}
                />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--success)] transition-all duration-500"
                  style={{ width: `${(point.revenueJpy / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
