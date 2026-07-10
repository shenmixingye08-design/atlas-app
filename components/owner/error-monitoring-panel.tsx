"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ErrorCategoryId,
  ErrorCategorySnapshot,
  ErrorMonitoringSnapshot,
  ErrorResolutionStatus,
} from "@/lib/owner/error-monitoring/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerDate } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<ErrorMonitoringSnapshot> {
  const response = await fetch("/api/owner/error-monitoring", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load error monitoring");
  }
  return response.json() as Promise<ErrorMonitoringSnapshot>;
}

async function patchResolution(
  categoryId: ErrorCategoryId,
  resolutionStatus: ErrorResolutionStatus,
): Promise<ErrorMonitoringSnapshot> {
  const response = await fetch("/api/owner/error-monitoring", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, resolutionStatus }),
  });

  if (!response.ok) {
    throw new Error("Failed to update resolution status");
  }

  return response.json() as Promise<ErrorMonitoringSnapshot>;
}

const RESOLUTION_LABELS: Record<ErrorResolutionStatus, string> = {
  open: ui.errorMonitoring.statusOpen,
  resolved: ui.errorMonitoring.statusResolved,
};

function StatusBadge({ status }: { status: ErrorResolutionStatus }) {
  const classes = {
    open: "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25",
    resolved: "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        classes[status],
      )}
    >
      {RESOLUTION_LABELS[status]}
    </span>
  );
}

function ErrorCategoryRow({
  category,
  busy,
  onResolve,
}: {
  category: ErrorCategorySnapshot;
  busy: boolean;
  onResolve: (
    categoryId: ErrorCategoryId,
    resolutionStatus: ErrorResolutionStatus,
  ) => void;
}) {
  const hasErrors = category.occurrenceCount > 0;

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-4 pr-4 align-top">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{category.label}</p>
          <p className="text-xs text-[var(--text-secondary)]">{category.description}</p>
          {category.lastMessage && hasErrors && (
            <p className="text-xs text-[var(--text-muted)]">{category.lastMessage}</p>
          )}
        </div>
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {category.occurrenceCount.toLocaleString("ja-JP")}
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {category.lastOccurredAt
          ? formatOwnerDate(category.lastOccurredAt)
          : ui.errorMonitoring.noOccurrence}
      </td>
      <td className="py-4 pr-4 align-top">
        <StatusBadge
          status={hasErrors ? category.resolutionStatus : "resolved"}
        />
      </td>
      <td className="py-4 align-top">
        {hasErrors && (
          <div className="flex flex-wrap gap-2">
            {category.resolutionStatus === "open" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolve(category.categoryId, "resolved")}
                className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-100 transition-colors hover:bg-[var(--success-bg)] disabled:opacity-50"
              >
                {ui.errorMonitoring.markResolved}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolve(category.categoryId, "open")}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                {ui.errorMonitoring.markOpen}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function ErrorMonitoringPanel() {
  const [snapshot, setSnapshot] = useState<ErrorMonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<ErrorCategoryId | null>(null);

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

  const handleResolve = async (
    categoryId: ErrorCategoryId,
    resolutionStatus: ErrorResolutionStatus,
  ) => {
    setBusyId(categoryId);
    setError(null);
    try {
      setSnapshot(await patchResolution(categoryId, resolutionStatus));
    } catch {
      setError(ui.error.generic);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.errorMonitoring.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.errorMonitoring.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.errorMonitoring.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {snapshot && snapshot.openCount > 0 && (
        <Card padding="md" className="border-amber-400/30 bg-amber-500/10 text-amber-50">
          {ui.errorMonitoring.openAlert(snapshot.openCount)}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{ui.errorMonitoring.listTitle}</h2>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.errorMonitoring.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.errorMonitoring.loading}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-4 font-medium">
                    {ui.errorMonitoring.categoryColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.errorMonitoring.countColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.errorMonitoring.lastOccurredColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.errorMonitoring.statusColumn}
                  </th>
                  <th className="pb-3 font-medium">
                    {ui.errorMonitoring.actionColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.categories.map((category) => (
                  <ErrorCategoryRow
                    key={category.categoryId}
                    category={category}
                    busy={busyId === category.categoryId}
                    onResolve={handleResolve}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.errorMonitoring.note}</p>
    </div>
  );
}
