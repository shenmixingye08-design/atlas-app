"use client";

import { useCallback, useEffect, useState } from "react";

import type { GrowthOsSnapshot } from "@/lib/owner/growth-os/types";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function formatValue(
  value: number | null | undefined,
  unit: "count" | "percent"
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "percent") return `${value}%`;
  return String(value);
}

function formatDelta(
  delta: number | null | undefined,
  unit: "count" | "percent"
): string {
  if (delta == null || !Number.isFinite(delta)) return "前週 —";
  const sign = delta > 0 ? "+" : "";
  if (unit === "percent") return `前週比 ${sign}${delta}pt`;
  return `前週比 ${sign}${delta}`;
}

export function GrowthOsPanel() {
  const [snapshot, setSnapshot] = useState<GrowthOsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/growth-os", { cache: "no-store" });
      if (!response.ok) throw new Error("Growth OSを読み込めませんでした");
      setSnapshot((await response.json()) as GrowthOsSnapshot);
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
    return <LoadingState message="成長指標を集計しています" />;
  }
  if (error && !snapshot) {
    return <ErrorState message={error} />;
  }
  if (!snapshot) return null;

  return (
    <div className="mx-auto max-w-lg space-y-0">
      <div className="border-b border-[var(--border-subtle)] py-8 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">Growth OS</p>
        <p className="mt-2 text-lg font-semibold text-foreground">
          指標は3つだけ
        </p>
      </div>

      {snapshot.metrics.map((metric) => (
        <div
          key={metric.id}
          className="border-b border-[var(--border-subtle)] py-8 text-center"
        >
          <p className="text-sm text-[var(--foreground-muted)]">
            {metric.label}
          </p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
            {formatValue(metric.value, metric.unit)}
          </p>
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            {formatDelta(metric.delta, metric.unit)}
          </p>
        </div>
      ))}

      <p className="py-8 text-center text-sm text-[var(--foreground-muted)]">
        {snapshot.ruleSummary}
      </p>
    </div>
  );
}
