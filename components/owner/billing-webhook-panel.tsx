"use client";

import { useCallback, useEffect, useState } from "react";

import type { StripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerPercent } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<StripeWebhookMonitoringSnapshot> {
  const response = await fetch("/api/owner/billing-webhook", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load billing webhook monitoring");
  }
  return response.json() as Promise<StripeWebhookMonitoringSnapshot>;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card
      padding="lg"
      className="border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
    >
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </Card>
  );
}

export function BillingWebhookPanel() {
  const [snapshot, setSnapshot] = useState<StripeWebhookMonitoringSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch {
      setError(ui.error.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card padding="lg" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-50">
        {error}
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
        {ui.billingWebhook.loading}
      </Card>
    );
  }

  const latest = snapshot.latestWebhook;

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)]">{ui.billingWebhook.eyebrow}</p>
        <h1 className="text-display text-foreground">{ui.billingWebhook.title}</h1>
        <p className="max-w-2xl text-body text-[var(--text-secondary)]">
          {ui.billingWebhook.subtitle}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={ui.billingWebhook.successRate}
          value={formatOwnerPercent(snapshot.successRatePercent)}
          hint={ui.billingWebhook.totalEvents(snapshot.totalCount)}
        />
        <MetricCard
          label={ui.billingWebhook.failureCount}
          value={snapshot.failureCount.toLocaleString("ja-JP")}
        />
        <MetricCard
          label={ui.billingWebhook.lastSyncedAt}
          value={
            snapshot.lastSyncedAt
              ? new Date(snapshot.lastSyncedAt).toLocaleString("ja-JP")
              : "—"
          }
        />
        <MetricCard
          label={ui.billingWebhook.latestWebhook}
          value={latest ? latest.eventType : "—"}
          hint={
            latest
              ? new Date(latest.processedAt).toLocaleString("ja-JP")
              : ui.billingWebhook.noEvents
          }
        />
      </div>

      <Card padding="lg" className="border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <h2 className="text-base font-semibold">{ui.billingWebhook.recentTitle}</h2>
        {snapshot.recentWebhooks.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">{ui.billingWebhook.noEvents}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="py-3 pr-4 font-medium">{ui.billingWebhook.timeColumn}</th>
                  <th className="py-3 pr-4 font-medium">{ui.billingWebhook.eventColumn}</th>
                  <th className="py-3 pr-4 font-medium">{ui.billingWebhook.statusColumn}</th>
                  <th className="py-3 pr-4 font-medium">{ui.billingWebhook.userColumn}</th>
                  <th className="py-3 font-medium">{ui.billingWebhook.messageColumn}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentWebhooks.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 align-top text-[var(--text-secondary)]">
                      {new Date(entry.processedAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="py-3 pr-4 align-top font-mono text-xs text-[var(--text-secondary)]">
                      {entry.eventType}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          entry.status === "success"
                            ? "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/25"
                            : entry.status === "failure"
                              ? "bg-[var(--error-bg)] text-[var(--error)] ring-[var(--error)]/25"
                              : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
                        )}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 align-top font-mono text-xs text-[var(--text-secondary)]">
                      {entry.userId ?? "—"}
                    </td>
                    <td className="py-3 align-top text-[var(--text-secondary)]">{entry.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--text-secondary)]">
          {ui.billingWebhook.generatedAt(
            new Date(snapshot.generatedAt).toLocaleString("ja-JP"),
          )}
        </p>
      </Card>
    </div>
  );
}

export function BillingWebhookSummaryCard({
  snapshot,
}: {
  snapshot: StripeWebhookMonitoringSnapshot;
}) {
  const latest = snapshot.latestWebhook;

  return (
    <Card padding="lg" className="border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{ui.billingWebhook.dashboardTitle}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{ui.billingWebhook.dashboardHint}</p>
        </div>
        <a
          href="/owner/billing-webhook"
          className="text-sm text-accent hover:underline"
        >
          {ui.billingWebhook.viewDetails}
        </a>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--text-secondary)]">{ui.billingWebhook.latestWebhook}</dt>
          <dd className="mt-1 text-sm font-medium">
            {latest ? latest.eventType : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-secondary)]">{ui.billingWebhook.successRate}</dt>
          <dd className="mt-1 text-sm font-medium">
            {formatOwnerPercent(snapshot.successRatePercent)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-secondary)]">{ui.billingWebhook.failureCount}</dt>
          <dd className="mt-1 text-sm font-medium">
            {snapshot.failureCount.toLocaleString("ja-JP")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-secondary)]">{ui.billingWebhook.lastSyncedAt}</dt>
          <dd className="mt-1 text-sm font-medium">
            {snapshot.lastSyncedAt
              ? new Date(snapshot.lastSyncedAt).toLocaleString("ja-JP")
              : "—"}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
