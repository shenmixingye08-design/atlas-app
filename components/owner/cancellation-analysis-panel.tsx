"use client";

import { useCallback, useEffect, useState } from "react";

import type { CancellationAnalysisSnapshot } from "@/lib/owner/cancellation-analysis/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerPercent } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<CancellationAnalysisSnapshot> {
  const response = await fetch("/api/owner/cancellation-analysis", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load cancellation analysis");
  }
  return response.json() as Promise<CancellationAnalysisSnapshot>;
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

  const increased = value > 0;
  const neutral = value === 0;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        neutral
          ? "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]"
          : increased
            ? "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25"
            : "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25",
      )}
    >
      {formatMomChange(value)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-muted)] p-5">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function CancellationAnalysisPanel() {
  const [snapshot, setSnapshot] = useState<CancellationAnalysisSnapshot | null>(
    null,
  );
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
          {ui.cancellationAnalysis.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.cancellationAnalysis.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.cancellationAnalysis.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {!snapshot ? (
        <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
          <p className="text-sm text-[var(--text-secondary)]">{ui.cancellationAnalysis.loading}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label={ui.cancellationAnalysis.canceledCountLabel}
              value={snapshot.canceledCount.toLocaleString("ja-JP")}
              hint={
                snapshot.isEstimated ? ui.cancellationAnalysis.estimatedBadge : undefined
              }
            />
            <SummaryCard
              label={ui.cancellationAnalysis.churnRateLabel}
              value={
                snapshot.churnRatePercent === null
                  ? "—"
                  : formatOwnerPercent(snapshot.churnRatePercent)
              }
            />
            <SummaryCard
              label={ui.cancellationAnalysis.momLabel}
              value={formatMomChange(snapshot.momChangePercent)}
            />
          </div>

          <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {ui.cancellationAnalysis.reasonsTitle}
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {ui.cancellationAnalysis.periodLabel(
                    snapshot.period.monthLabel,
                    snapshot.period.previousMonthLabel,
                  )}
                </p>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {ui.cancellationAnalysis.generatedAt(snapshot.generatedAt)}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                    <th className="pb-3 pr-4 font-medium">
                      {ui.cancellationAnalysis.reasonColumn}
                    </th>
                    <th className="pb-3 pr-4 font-medium">
                      {ui.cancellationAnalysis.countColumn}
                    </th>
                    <th className="pb-3 pr-4 font-medium">
                      {ui.cancellationAnalysis.shareColumn}
                    </th>
                    <th className="pb-3 font-medium">
                      {ui.cancellationAnalysis.momColumn}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.reasons.map((reason) => (
                    <tr
                      key={reason.reasonId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-4 pr-4 align-top font-medium text-foreground">
                        {reason.label}
                      </td>
                      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
                        {reason.count.toLocaleString("ja-JP")}
                      </td>
                      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
                        {formatOwnerPercent(reason.sharePercent)}
                      </td>
                      <td className="py-4 align-top">
                        <MomBadge value={reason.momChangePercent} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <p className="text-xs text-[var(--text-muted)]">{ui.cancellationAnalysis.note}</p>
    </div>
  );
}
