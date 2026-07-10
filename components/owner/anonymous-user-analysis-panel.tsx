"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  AnonymousUserAnalysisSnapshot,
  AnonymousUserRow,
} from "@/lib/owner/anonymous-user-analysis/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerUsd } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<AnonymousUserAnalysisSnapshot> {
  const response = await fetch("/api/owner/anonymous-user-analysis", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load anonymous user analysis");
  }
  return response.json() as Promise<AnonymousUserAnalysisSnapshot>;
}

function formatMargin(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

function UserRow({ user }: { user: AnonymousUserRow }) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] last:border-0",
        user.isHighCost && "bg-rose-500/5",
      )}
    >
      <td className="py-4 pr-4 align-top font-mono text-sm text-foreground">
        {user.anonymousUserId}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">{user.planLabel}</td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatOwnerUsd(user.apiCostUsd, true)}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatMargin(user.profitMarginPercent)}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {user.featuresUsed.length > 0 ? user.featuresUsed.join("、") : "—"}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {user.usageCount.toLocaleString("ja-JP")}
      </td>
      <td className="py-4 align-top">
        {user.isHighCost ? (
          <span className="inline-flex rounded-full bg-[var(--error-bg)] px-2.5 py-0.5 text-xs font-medium text-rose-100 ring-1 ring-inset ring-[var(--error)]/25">
            {ui.anonymousUserAnalysis.highCostYes}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">
            {ui.anonymousUserAnalysis.highCostNo}
          </span>
        )}
      </td>
    </tr>
  );
}

export function AnonymousUserAnalysisPanel() {
  const [snapshot, setSnapshot] = useState<AnonymousUserAnalysisSnapshot | null>(
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
          {ui.anonymousUserAnalysis.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.anonymousUserAnalysis.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.anonymousUserAnalysis.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {snapshot && snapshot.highCostCount > 0 && (
        <Card padding="md" className="border-amber-400/30 bg-amber-500/10 text-amber-100">
          {ui.anonymousUserAnalysis.highCostAlert(snapshot.highCostCount)}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {ui.anonymousUserAnalysis.listTitle}
            </h2>
            {snapshot && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.anonymousUserAnalysis.periodLabel(snapshot.period.monthLabel)}
                {snapshot.isEstimated && (
                  <>
                    {" · "}
                    {ui.anonymousUserAnalysis.estimatedBadge}
                  </>
                )}
              </p>
            )}
          </div>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.anonymousUserAnalysis.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.anonymousUserAnalysis.loading}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.idColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.planColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.apiCostColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.marginColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.featuresColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.anonymousUserAnalysis.usageColumn}
                  </th>
                  <th className="pb-3 font-medium">
                    {ui.anonymousUserAnalysis.highCostColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.users.map((user) => (
                  <UserRow key={user.anonymousUserId} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.anonymousUserAnalysis.note}</p>
    </div>
  );
}
