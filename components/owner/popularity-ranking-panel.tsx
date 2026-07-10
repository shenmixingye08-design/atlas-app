"use client";

import { useCallback, useEffect, useState } from "react";

import type { PopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<PopularityRankingSnapshot> {
  const response = await fetch("/api/owner/popularity-ranking", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load popularity ranking");
  }
  return response.json() as Promise<PopularityRankingSnapshot>;
}

function formatMomChange(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "±0%";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function MomBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[var(--text-secondary)]">—</span>;
  }

  const positive = value > 0;
  const neutral = value === 0;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        neutral
          ? "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]"
          : positive
            ? "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25"
            : "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25",
      )}
    >
      {formatMomChange(value)}
    </span>
  );
}

export function PopularityRankingPanel() {
  const [snapshot, setSnapshot] = useState<PopularityRankingSnapshot | null>(null);
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

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.popularityRanking.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.popularityRanking.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.popularityRanking.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{ui.popularityRanking.listTitle}</h2>
            {snapshot && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.popularityRanking.periodLabel(
                  snapshot.period.monthLabel,
                  snapshot.period.previousMonthLabel,
                )}
              </p>
            )}
          </div>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.popularityRanking.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.popularityRanking.loading}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-4 font-medium">
                    {ui.popularityRanking.rankColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.popularityRanking.featureColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.popularityRanking.usersColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.popularityRanking.usageColumn}
                  </th>
                  <th className="pb-3 font-medium">
                    {ui.popularityRanking.momColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rankings.map((entry) => (
                  <tr
                    key={entry.featureId}
                    className="border-b border-[var(--border)] last:border-0"
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
                            {ui.popularityRanking.estimatedBadge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
                      {entry.activeUsers.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
                      {entry.usageCount.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-4 align-top">
                      <MomBadge value={entry.momChangePercent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.popularityRanking.note}</p>
    </div>
  );
}
