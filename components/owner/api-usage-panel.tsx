"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ApiUsageMonitoringSnapshot,
  ApiUsageProviderId,
  ApiUsageProviderSnapshot,
} from "@/lib/owner/api-usage";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerUsd } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<ApiUsageMonitoringSnapshot> {
  const response = await fetch("/api/owner/api-usage", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load API usage");
  }
  return response.json() as Promise<ApiUsageMonitoringSnapshot>;
}

async function patchBudget(
  providerId: ApiUsageProviderId,
  budgetUsd: number,
): Promise<ApiUsageMonitoringSnapshot> {
  const response = await fetch("/api/owner/api-usage", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, budgetUsd }),
  });

  if (!response.ok) {
    throw new Error("Failed to update budget");
  }

  return response.json() as Promise<ApiUsageMonitoringSnapshot>;
}

function UsageCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

function ProviderUsageCard({
  provider,
  busy,
  onBudgetSave,
}: {
  provider: ApiUsageProviderSnapshot;
  busy: boolean;
  onBudgetSave: (providerId: ApiUsageProviderId, budgetUsd: number) => void;
}) {
  const [budgetInput, setBudgetInput] = useState(String(provider.budgetUsd));

  useEffect(() => {
    setBudgetInput(String(provider.budgetUsd));
  }, [provider.budgetUsd]);

  const warningClasses = {
    none: "border-[var(--border)]",
    approaching: "border-amber-400/40 ring-1 ring-amber-400/20",
    critical: "border-rose-400/40 ring-1 ring-rose-400/20",
  } as const;

  return (
    <li
      className={cn(
        "rounded-[var(--radius-xl)] border bg-[var(--surface-muted)] p-5",
        warningClasses[provider.warningLevel],
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{provider.label}</h3>
            {provider.isEstimated && (
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                {ui.apiUsage.estimatedBadge}
              </span>
            )}
            {provider.warningLevel === "approaching" && (
              <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 text-xs font-medium text-amber-100">
                {ui.apiUsage.warningApproaching}
              </span>
            )}
            {provider.warningLevel === "critical" && (
              <span className="rounded-full bg-[var(--error-bg)] px-2 py-0.5 text-xs font-medium text-rose-100">
                {ui.apiUsage.warningCritical}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.apiUsage.usagePercent(provider.usagePercent)}
          </p>
        </div>

        <div className="grid w-full max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
          <UsageCell
            label={ui.apiUsage.today}
            value={formatOwnerUsd(provider.todayUsd, true)}
          />
          <UsageCell
            label={ui.apiUsage.month}
            value={formatOwnerUsd(provider.monthUsd, true)}
          />
          <UsageCell
            label={ui.apiUsage.remaining}
            value={formatOwnerUsd(provider.remainingUsd, true)}
            hint={
              provider.remainingUsd <= 0
                ? ui.apiUsage.overBudget
                : undefined
            }
          />
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]" htmlFor={`budget-${provider.providerId}`}>
              {ui.apiUsage.budget}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`budget-${provider.providerId}`}
                type="number"
                min={1}
                step={1}
                value={budgetInput}
                disabled={busy}
                onChange={(event) => setBudgetInput(event.target.value)}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5 text-sm text-foreground outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onBudgetSave(provider.providerId, Number(budgetInput) || provider.budgetUsd)
                }
                className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                {ui.apiUsage.saveBudget}
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function ApiUsagePanel() {
  const [snapshot, setSnapshot] = useState<ApiUsageMonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<ApiUsageProviderId | null>(null);

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

  const handleBudgetSave = async (
    providerId: ApiUsageProviderId,
    budgetUsd: number,
  ) => {
    setBusyId(providerId);
    setError(null);
    try {
      setSnapshot(await patchBudget(providerId, budgetUsd));
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
          {ui.apiUsage.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.apiUsage.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.apiUsage.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {snapshot && snapshot.warnings.length > 0 && (
        <Card padding="lg" className="border-amber-400/30 bg-amber-500/10 text-amber-50 shadow-none">
          <h2 className="text-base font-semibold">{ui.apiUsage.warningsTitle}</h2>
          <ul className="mt-3 space-y-2">
            {snapshot.warnings.map((warning) => (
              <li key={warning.providerId} className="text-sm leading-relaxed">
                {warning.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{ui.apiUsage.providersTitle}</h2>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.apiUsage.periodLabel(snapshot.period.monthLabel, snapshot.period.day)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.apiUsage.loading}</p>
        ) : (
          <ul className="space-y-4">
            {snapshot.providers.map((provider) => (
              <ProviderUsageCard
                key={provider.providerId}
                provider={provider}
                busy={busyId === provider.providerId}
                onBudgetSave={handleBudgetSave}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.apiUsage.note}</p>
    </div>
  );
}
