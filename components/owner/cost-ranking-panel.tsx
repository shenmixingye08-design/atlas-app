"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  CostFeatureMetrics,
  CostRankingSnapshot,
  CostWarningLevel,
} from "@/lib/owner/cost-ranking/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerDuration, formatOwnerUsd } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<CostRankingSnapshot> {
  const response = await fetch("/api/owner/cost-ranking", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load cost ranking");
  }
  return response.json() as Promise<CostRankingSnapshot>;
}

function formatMargin(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

function formatCostRatio(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

function WarningBadge({ level }: { level: CostWarningLevel }) {
  if (level === "none") {
    return (
      <span className="text-xs text-[var(--text-secondary)]">{ui.costRanking.warningNone}</span>
    );
  }

  const isCritical = level === "critical";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        isCritical
          ? "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25"
          : "bg-[var(--warning-bg)] text-amber-100 ring-[var(--warning)]/25",
      )}
    >
      {isCritical
        ? ui.costRanking.warningCritical
        : ui.costRanking.warningApproaching}
    </span>
  );
}

function CostRow({ entry }: { entry: CostFeatureMetrics }) {
  const warningClasses = {
    none: "",
    approaching: "bg-amber-500/5",
    critical: "bg-rose-500/5",
  } as const;

  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] last:border-0",
        warningClasses[entry.warningLevel],
      )}
    >
      <td className="py-4 pr-4 align-top">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-semibold text-foreground">
          {entry.rank}
        </span>
      </td>
      <td className="py-4 pr-4 align-top">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{entry.label}</p>
          {entry.isEstimated && (
            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {ui.costRanking.estimatedBadge}
            </span>
          )}
        </div>
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatOwnerUsd(entry.apiCostUsd, true)}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatOwnerDuration(entry.avgUsageTimeMs)}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatMargin(entry.profitMarginPercent)}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatCostRatio(entry.costRatioPercent)}
      </td>
      <td className="py-4 align-top">
        <WarningBadge level={entry.warningLevel} />
      </td>
    </tr>
  );
}

export function CostRankingPanel() {
  const [snapshot, setSnapshot] = useState<CostRankingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch {
      setError(ui.error.generic);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const warningCount =
    snapshot?.rankings.filter((entry) => entry.warningLevel !== "none")
      .length ?? 0;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.costRanking.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.costRanking.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.costRanking.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {snapshot && warningCount > 0 && (
        <Card
          padding="md"
          className="border-amber-400/30 bg-amber-500/10 text-amber-100"
        >
          {ui.costRanking.highCostAlert(warningCount)}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{ui.costRanking.listTitle}</h2>
            {snapshot && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.costRanking.periodLabel(snapshot.period.monthLabel)}
                {" · "}
                {ui.costRanking.totalCostLabel(
                  formatOwnerUsd(snapshot.totalApiCostUsd, true),
                )}
              </p>
            )}
          </div>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.costRanking.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.costRanking.loading}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.rankColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.featureColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.apiCostColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.avgTimeColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.marginColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.costRanking.costRatioColumn}
                  </th>
                  <th className="pb-3 font-medium">
                    {ui.costRanking.warningColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rankings.map((entry) => (
                  <CostRow key={entry.featureId} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.costRanking.note}</p>
    </div>
  );
}
