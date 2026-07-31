"use client";

import { useCallback, useEffect, useState } from "react";

import type { LaunchKpiBand } from "@/lib/owner/launch-verdict/evaluate";
import type { LaunchVerdictSnapshot } from "@/lib/owner/launch-verdict/types";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function formatValue(
  value: number | null | undefined,
  unit: "percent" | "seconds" | "score"
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "percent") return `${value}%`;
  if (unit === "seconds") return `${value}秒`;
  return String(value);
}

function bandLabel(band: LaunchKpiBand): string {
  if (band === "go") return "公開";
  if (band === "delay") return "延期";
  if (band === "kill") return "中止";
  return "データ不足";
}

function MetricRow({
  label,
  value,
  band,
}: {
  label: string;
  value: string;
  band: LaunchKpiBand;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-6 text-center last:border-b-0">
      <p className="text-sm text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
        {bandLabel(band)}
      </p>
    </div>
  );
}

export function LaunchVerdictPanel() {
  const [snapshot, setSnapshot] = useState<LaunchVerdictSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/launch-verdict", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("公開判定を読み込めませんでした");
      setSnapshot((await response.json()) as LaunchVerdictSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snapshot) {
    return <LoadingState message="公開判定を集計しています" />;
  }
  if (error && !snapshot) {
    return <ErrorState message={error} />;
  }
  if (!snapshot) return null;

  return (
    <div className="mx-auto max-w-lg space-y-0">
      <div className="border-b border-[var(--border-subtle)] py-10 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">公開判定</p>
        <p className="mt-3 text-6xl leading-none" aria-label={snapshot.overallLabel}>
          {snapshot.signal}
        </p>
        <p className="mt-3 text-lg font-semibold text-foreground">
          {snapshot.overallLabel}
        </p>
      </div>

      {snapshot.kpis.map((kpi) => (
        <MetricRow
          key={kpi.id}
          label={kpi.label}
          value={formatValue(kpi.value, kpi.unit)}
          band={kpi.band}
        />
      ))}

      <div className="border-b border-[var(--border-subtle)] py-8 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">
          改善が必要なKPI
        </p>
        {snapshot.needsImprovement.length === 0 ? (
          <p className="mt-3 text-lg font-semibold text-foreground">なし</p>
        ) : (
          <ul className="mt-4 space-y-3 text-left">
            {snapshot.needsImprovement.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 text-foreground"
              >
                <span>{item.label}</span>
                <span className="shrink-0 text-[var(--foreground-muted)]">
                  {formatValue(item.value, item.unit)} · {bandLabel(item.band)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
