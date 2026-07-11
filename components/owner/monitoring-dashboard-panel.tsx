"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AnalyticsKpis,
  AnalyticsSeriesPoint,
  MonitorHealthLevel,
  MonitoringSnapshot,
} from "@/lib/owner/monitoring/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

async function fetchSnapshot(): Promise<MonitoringSnapshot> {
  const response = await fetch("/api/owner/monitoring", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load monitoring");
  return response.json() as Promise<MonitoringSnapshot>;
}

const LEVEL_LABEL: Record<MonitorHealthLevel, string> = {
  ok: "正常",
  warn: "警告",
  down: "停止",
};

const LEVEL_CLASS: Record<MonitorHealthLevel, string> = {
  ok: "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25",
  warn: "bg-[var(--warning-bg)] text-amber-100 ring-[var(--warning)]/25",
  down: "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25",
};

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function KpiGrid({ kpis }: { kpis: AnalyticsKpis }) {
  const items = [
    { label: ui.owner.monitoringUsers, value: String(kpis.activeUsers) },
    {
      label: ui.owner.monitoringActiveRate,
      value: `${kpis.activeRatePercent}%`,
    },
    { label: ui.owner.monitoringAiRuns, value: String(kpis.aiRuns) },
    {
      label: ui.owner.monitoringAutomationRuns,
      value: String(kpis.automationRuns),
    },
    {
      label: ui.owner.monitoringCommanderRuns,
      value: String(kpis.commanderRuns),
    },
    {
      label: ui.owner.monitoringNotifications,
      value: String(kpis.notificationCount),
    },
    {
      label: ui.owner.monitoringStripeRevenue,
      value: formatYen(kpis.stripeRevenueJpy),
    },
    {
      label: ui.owner.monitoringOpenAiCost,
      value: formatYen(kpis.openAiCostJpy),
    },
    {
      label: ui.owner.monitoringProfitForecast,
      value: formatYen(kpis.profitForecastJpy),
    },
    {
      label: ui.owner.monitoringErrorRate,
      value: `${kpis.apiErrorRatePercent}%`,
    },
    {
      label: ui.owner.monitoringAvgResponse,
      value: `${kpis.avgResponseMs.toLocaleString("ja-JP")} ms`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-3"
        >
          <div className="text-xs text-[var(--foreground-muted)]">
            {item.label}
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeriesBars({
  title,
  points,
  field,
}: {
  title: string;
  points: readonly AnalyticsSeriesPoint[];
  field: keyof Pick<
    AnalyticsSeriesPoint,
    "aiRuns" | "automationRuns" | "commanderRuns" | "errors"
  >;
}) {
  const max = Math.max(1, ...points.map((p) => Number(p[field]) || 0));
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>
      <div className="flex h-32 items-end gap-1.5">
        {points.map((point) => {
          const value = Number(point[field]) || 0;
          const height = Math.max(4, Math.round((value / max) * 100));
          return (
            <div
              key={point.key}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={`${point.label}: ${value}`}
            >
              <div
                className="w-full rounded-t bg-[var(--accent)]/70"
                style={{ height: `${height}%` }}
              />
              <span className="text-[10px] text-[var(--foreground-muted)]">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonitoringDashboardPanel() {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [seriesMode, setSeriesMode] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const load = useCallback(async () => {
    try {
      setSnapshot(await fetchSnapshot());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const kpis = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.analytics[period];
  }, [snapshot, period]);

  const series = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.series[seriesMode];
  }, [snapshot, seriesMode]);

  if (!snapshot && !error) {
    return <LoadingState message={ui.owner.monitoringLoading} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.owner.monitoringTitle}
          </h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.owner.monitoringSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                "/api/owner/monitoring?format=csv&section=all",
                "_blank",
              )
            }
          >
            {ui.owner.monitoringCsvAll}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                "/api/owner/monitoring?format=csv&section=analytics",
                "_blank",
              )
            }
          >
            {ui.owner.monitoringCsvAnalytics}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                "/api/owner/monitoring?format=csv&section=incidents",
                "_blank",
              )
            }
          >
            {ui.owner.monitoringCsvIncidents}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                "/api/owner/monitoring?format=csv&section=audit",
                "_blank",
              )
            }
          >
            {ui.owner.monitoringCsvAudit}
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {snapshot && (
        <>
          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <span>
                {ui.owner.monitoringOk}: {snapshot.okCount}
              </span>
              <span>
                {ui.owner.monitoringWarn}: {snapshot.warnCount}
              </span>
              <span>
                {ui.owner.monitoringDown}: {snapshot.downCount}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
                    <th className="px-2 py-2 font-medium">
                      {ui.owner.monitoringService}
                    </th>
                    <th className="px-2 py-2 font-medium">
                      {ui.owner.monitoringLevel}
                    </th>
                    <th className="px-2 py-2 font-medium">
                      {ui.owner.monitoringDetail}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.health.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border-subtle)]"
                    >
                      <td className="px-2 py-3 font-medium">{row.label}</td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                            LEVEL_CLASS[row.level],
                          )}
                        >
                          {LEVEL_LABEL[row.level]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[var(--foreground-muted)]">
                        {row.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {ui.owner.monitoringAnalyticsTitle}
              </h2>
              <div className="flex gap-2">
                {(
                  [
                    ["today", ui.owner.monitoringPeriodToday],
                    ["week", ui.owner.monitoringPeriodWeek],
                    ["month", ui.owner.monitoringPeriodMonth],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={period === id ? "primary" : "secondary"}
                    onClick={() => setPeriod(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {kpis && (
              <>
                {kpis.isEstimated && (
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {ui.owner.monitoringEstimated}
                  </p>
                )}
                <KpiGrid kpis={kpis} />
              </>
            )}
          </Card>

          <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {ui.owner.monitoringChartsTitle}
              </h2>
              <div className="flex gap-2">
                {(
                  [
                    ["daily", ui.owner.monitoringSeriesDaily],
                    ["weekly", ui.owner.monitoringSeriesWeekly],
                    ["monthly", ui.owner.monitoringSeriesMonthly],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={seriesMode === id ? "primary" : "secondary"}
                    onClick={() => setSeriesMode(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <SeriesBars
                title={ui.owner.monitoringAiRuns}
                points={series}
                field="aiRuns"
              />
              <SeriesBars
                title={ui.owner.monitoringAutomationRuns}
                points={series}
                field="automationRuns"
              />
              <SeriesBars
                title={ui.owner.monitoringCommanderRuns}
                points={series}
                field="commanderRuns"
              />
              <SeriesBars
                title={ui.owner.monitoringErrorRate}
                points={series}
                field="errors"
              />
            </div>
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.monitoringIncidentsTitle}
            </h2>
            {!snapshot.incidents.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.monitoringIncidentsEmpty}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
                      <th className="px-2 py-2 font-medium">日時</th>
                      <th className="px-2 py-2 font-medium">種別</th>
                      <th className="px-2 py-2 font-medium">対象</th>
                      <th className="px-2 py-2 font-medium">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.incidents.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border-subtle)] align-top"
                      >
                        <td className="px-2 py-2 whitespace-nowrap">
                          {new Intl.DateTimeFormat("ja-JP", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(row.at))}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {row.kind}
                        </td>
                        <td className="px-2 py-2">{row.targetId}</td>
                        <td className="px-2 py-2">{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
