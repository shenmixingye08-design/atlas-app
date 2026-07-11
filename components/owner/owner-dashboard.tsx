import type {
  OwnerCountMetric,
  OwnerCurrencyMetric,
  OwnerDashboardSnapshot,
  OwnerMetricAvailability,
  OwnerProfitMetric,
} from "@/lib/owner/types";
import type { ApiUsageWarning } from "@/lib/owner/api-usage";
import {
  formatOwnerDate,
  formatOwnerJpy,
  formatOwnerPercent,
  formatOwnerUsd,
} from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Card } from "@/components/ui/card";
import Link from "next/link";

function availabilityLabel(availability: OwnerMetricAvailability | "incomplete"): string {
  switch (availability) {
    case "disconnected":
      return ui.owner.statusDisconnected;
    case "unset":
      return ui.owner.statusUnset;
    case "empty":
      return ui.owner.statusEmpty;
    case "failed":
      return ui.owner.statusFailed;
    case "incomplete":
      return ui.owner.statusIncomplete;
    default:
      return ui.owner.statusOk;
  }
}

function formatMoneyMetric(metric: OwnerCurrencyMetric): string {
  if (metric.availability !== "ok" || (metric.amountUsd === null && metric.amountJpy === null)) {
    return metric.statusMessage ?? availabilityLabel(metric.availability);
  }
  if (metric.amountJpy !== null) return formatOwnerJpy(metric.amountJpy);
  if (metric.amountUsd !== null) return formatOwnerUsd(metric.amountUsd, true);
  return availabilityLabel(metric.availability);
}

function formatProfitMetric(metric: OwnerProfitMetric): string {
  if (metric.availability === "ok") {
    if (metric.amountJpy !== null) return formatOwnerJpy(metric.amountJpy);
    if (metric.amountUsd !== null) return formatOwnerUsd(metric.amountUsd, true);
  }
  return metric.statusMessage ?? availabilityLabel(metric.availability);
}

function metricMeta(metric: {
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode?: "live" | "test" | null;
  updateFailed?: boolean;
  statusMessage?: string | null;
}): string {
  const parts = [
    metric.periodLabel,
    metric.dataSourceLabel,
    metric.stripeMode === "live"
      ? ui.owner.modeLive
      : metric.stripeMode === "test"
        ? ui.owner.modeTest
        : null,
    metric.lastUpdatedAt
      ? ui.owner.lastSynced(formatOwnerDate(metric.lastUpdatedAt))
      : ui.owner.noSyncYet,
    metric.updateFailed ? ui.owner.updateFailedHint : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function MetricCard({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "revenue" | "cost" | "profit";
}) {
  const accentClasses = {
    default: "border-[var(--border)] bg-[var(--surface-muted)]",
    revenue: "border-[var(--success)]/25 bg-[var(--success-bg)]",
    cost: "border-[var(--error)]/25 bg-[var(--error-bg)]",
    profit: "border-[var(--accent)]/25 bg-[var(--accent-muted)]",
  } as const;

  return (
    <Card
      padding="lg"
      className={cn(
        "border shadow-none",
        accentClasses[accent],
        "text-foreground ",
      )}
    >
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </Card>
  );
}

function CountCard({ metric }: { metric: OwnerCountMetric }) {
  const value =
    metric.availability === "ok" && metric.value !== null
      ? metric.value.toLocaleString("ja-JP")
      : (metric.statusMessage ?? availabilityLabel(metric.availability));
  return (
    <MetricCard
      label={metric.label}
      value={value}
      hint={metricMeta(metric)}
    />
  );
}

function TrendBadge({ trend }: { trend: "up" | "flat" | "down" }) {
  const labels = {
    up: ui.owner.trendUp,
    flat: ui.owner.trendFlat,
    down: ui.owner.trendDown,
  } as const;

  const classes = {
    up: "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/25",
    flat: "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
    down: "bg-[var(--error-bg)] text-[var(--error)] ring-[var(--error)]/25",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        classes[trend],
      )}
    >
      {labels[trend]}
    </span>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      padding="lg"
      className="border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
    >
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function OwnerDashboard({
  snapshot,
  apiUsageWarnings = [],
}: {
  snapshot: OwnerDashboardSnapshot;
  apiUsageWarnings?: readonly ApiUsageWarning[];
}) {
  const modeBadge =
    snapshot.stripeMode === "live"
      ? ui.owner.modeLive
      : snapshot.stripeMode === "test"
        ? ui.owner.modeTest
        : ui.owner.modeUnknown;

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)]">{ui.owner.pageEyebrow}</p>
        <h1 className="text-display text-foreground">{ui.owner.pageTitle}</h1>
        <p className="max-w-2xl text-body text-[var(--text-secondary)]">
          {ui.owner.pageSubtitle(snapshot.period.label)}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {modeBadge} · {ui.owner.generatedAt(formatOwnerDate(snapshot.generatedAt))}
        </p>
      </header>

      {apiUsageWarnings.length > 0 && (
        <Card
          padding="lg"
          className="border-amber-400/30 bg-amber-500/10 text-amber-50 shadow-none"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {ui.apiUsage.dashboardWarning(apiUsageWarnings.length)}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
                {apiUsageWarnings.slice(0, 3).map((warning) => (
                  <li key={warning.providerId}>{warning.message}</li>
                ))}
              </ul>
            </div>
            <Link
              href="/owner/api-usage"
              className="shrink-0 rounded-full border border-amber-200/30 px-4 py-2 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-400/10"
            >
              {ui.apiUsage.dashboardWarningLink}
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={snapshot.revenue.label}
          value={formatMoneyMetric(snapshot.revenue)}
          hint={metricMeta(snapshot.revenue)}
          accent="revenue"
        />
        <MetricCard
          label={snapshot.refunds.label}
          value={formatMoneyMetric(snapshot.refunds)}
          hint={metricMeta(snapshot.refunds)}
          accent="cost"
        />
        <MetricCard
          label={snapshot.stripeFees.label}
          value={formatMoneyMetric(snapshot.stripeFees)}
          hint={metricMeta(snapshot.stripeFees)}
          accent="cost"
        />
        <MetricCard
          label={snapshot.netRevenue.label}
          value={formatMoneyMetric(snapshot.netRevenue)}
          hint={metricMeta(snapshot.netRevenue)}
          accent="revenue"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={snapshot.apiCost.label}
          value={formatMoneyMetric(snapshot.apiCost)}
          hint={metricMeta(snapshot.apiCost)}
          accent="cost"
        />
        <MetricCard
          label={snapshot.serverCost.label}
          value={formatMoneyMetric(snapshot.serverCost)}
          hint={metricMeta(snapshot.serverCost)}
          accent="cost"
        />
        <MetricCard
          label={snapshot.externalCost.label}
          value={formatMoneyMetric(snapshot.externalCost)}
          hint={metricMeta(snapshot.externalCost)}
          accent="cost"
        />
        <MetricCard
          label={snapshot.profit.label}
          value={formatProfitMetric(snapshot.profit)}
          hint={
            snapshot.profit.availability === "incomplete"
              ? [
                  metricMeta(snapshot.profit),
                  snapshot.profit.provisionalDeltaJpy !== null
                    ? ui.owner.provisionalDelta(
                        formatOwnerJpy(snapshot.profit.provisionalDeltaJpy),
                      )
                    : snapshot.profit.provisionalDeltaUsd !== null
                      ? ui.owner.provisionalDelta(
                          formatOwnerUsd(snapshot.profit.provisionalDeltaUsd, true),
                        )
                      : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : metricMeta(snapshot.profit)
          }
          accent="profit"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CountCard metric={snapshot.userMetrics.paid} />
        <CountCard metric={snapshot.userMetrics.cancelScheduled} />
        <CountCard metric={snapshot.userMetrics.paymentFailures} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title={ui.owner.userCountsTitle}>
          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.paidUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.paid.toLocaleString("ja-JP")}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.freeUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.free.toLocaleString("ja-JP")}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.churnedUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.churned.toLocaleString("ja-JP")}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {ui.owner.subscriptionStoreHint}
          </p>
        </SectionCard>

        <SectionCard title={ui.owner.aiUsageTitle}>
          {snapshot.aiUsage.availability !== "ok" ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {snapshot.aiUsage.statusMessage ?? ui.owner.statusEmpty}
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.aiRequests}</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {snapshot.aiUsage.requests.toLocaleString("ja-JP")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.aiCost}</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {formatOwnerUsd(snapshot.aiUsage.recordedCostUsd, true)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.inputTokens}</dt>
                <dd className="mt-1 font-medium">
                  {snapshot.aiUsage.inputTokens.toLocaleString("ja-JP")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.outputTokens}</dt>
                <dd className="mt-1 font-medium">
                  {snapshot.aiUsage.outputTokens.toLocaleString("ja-JP")}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {ui.owner.pricingTableHint(
              snapshot.aiUsage.pricingTableVersion,
              formatOwnerDate(snapshot.aiUsage.pricingTableUpdatedAt),
            )}
          </p>
        </SectionCard>

        <SectionCard title={ui.owner.runCountsTitle}>
          {snapshot.runCounts.availability !== "ok" ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {snapshot.runCounts.statusMessage ?? ui.owner.statusEmpty}
            </p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">{ui.owner.aiRequests}</dt>
                <dd className="font-semibold">
                  {snapshot.runCounts.aiRequests.toLocaleString("ja-JP")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">{ui.owner.automationRuns}</dt>
                <dd className="font-semibold">
                  {snapshot.runCounts.automationRuns.toLocaleString("ja-JP")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">{ui.owner.commanderRuns}</dt>
                <dd className="font-semibold">
                  {snapshot.runCounts.commanderRuns.toLocaleString("ja-JP")}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {snapshot.runCounts.dataSourceLabel}
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title={ui.owner.ecoModeTitle}>
          {snapshot.ecoModeAvailability !== "ok" ? (
            <p className="text-sm text-[var(--text-secondary)]">{ui.owner.statusEmpty}</p>
          ) : (
            <>
              <p className="text-3xl font-semibold text-[var(--success)]">
                {formatOwnerPercent(snapshot.ecoModeReductionPercent ?? 0)}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {ui.owner.ecoModeRuns(snapshot.ecoModeRuns)}
              </p>
            </>
          )}
        </SectionCard>

        <SectionCard title={ui.owner.stripePayoutTitle}>
          <p className="text-3xl font-semibold">
            {snapshot.nextStripePayout.availability === "ok"
              ? snapshot.nextStripePayout.amountJpy !== null
                ? formatOwnerJpy(snapshot.nextStripePayout.amountJpy)
                : formatOwnerUsd(snapshot.nextStripePayout.amountUsd ?? 0, true)
              : (snapshot.nextStripePayout.statusMessage ??
                availabilityLabel(snapshot.nextStripePayout.availability))}
          </p>
          {snapshot.nextStripePayout.scheduledAt && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {ui.owner.stripePayoutDate(
                formatOwnerDate(snapshot.nextStripePayout.scheduledAt),
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {ui.owner.stripePayoutStatus(snapshot.nextStripePayout.status)}
          </p>
        </SectionCard>

        <SectionCard title={ui.owner.webhookSummaryTitle}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-secondary)]">{ui.owner.webhookSuccessRate}</dt>
              <dd className="font-semibold">
                {snapshot.webhook.successRatePercent === null
                  ? ui.owner.statusEmpty
                  : formatOwnerPercent(snapshot.webhook.successRatePercent)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-secondary)]">{ui.owner.webhookLastSync}</dt>
              <dd className="font-semibold">
                {snapshot.webhook.lastSyncedAt
                  ? formatOwnerDate(snapshot.webhook.lastSyncedAt)
                  : "—"}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title={ui.owner.mrrTitle}>
        <p className="text-3xl font-semibold text-[var(--success)]">
          {formatOwnerJpy(snapshot.billing.mrrJpy)}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {ui.owner.mrrHint}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                <th className="pb-3 pr-4 font-medium">{ui.owner.planColumn}</th>
                <th className="pb-3 pr-4 font-medium">
                  {ui.owner.subscribersColumn}
                </th>
                <th className="pb-3 font-medium">{ui.owner.mrrColumn}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.billing.planBreakdown.map((row) => (
                <tr
                  key={row.planId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-3 pr-4 font-medium text-foreground">
                    {row.planName}
                  </td>
                  <td className="py-3 pr-4 text-[var(--text-secondary)]">
                    {row.activeSubscribers}
                  </td>
                  <td className="py-3 text-[var(--text-secondary)]">
                    {formatOwnerJpy(row.mrrJpy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title={ui.owner.popularFeaturesTitle}>
          {snapshot.popularFeaturesAvailability !== "ok" ||
          snapshot.popularFeatures.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{ui.owner.statusEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                    <th className="pb-3 pr-4 font-medium">{ui.owner.featureColumn}</th>
                    <th className="pb-3 pr-4 font-medium">{ui.owner.activeUsersColumn}</th>
                    <th className="pb-3 pr-4 font-medium">{ui.owner.usageColumn}</th>
                    <th className="pb-3 font-medium">{ui.owner.trendColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.popularFeatures.map((feature) => (
                    <tr
                      key={feature.featureId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-foreground">
                        {feature.featureName}
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)]">
                        {feature.activeUsers}
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)]">
                        {feature.usageCount.toLocaleString("ja-JP")}
                      </td>
                      <td className="py-3">
                        <TrendBadge trend={feature.trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title={ui.owner.highCostUsersTitle}>
          {snapshot.highCostUsersAvailability !== "ok" ||
          snapshot.highCostUsers.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{ui.owner.statusEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                    <th className="pb-3 pr-4 font-medium">{ui.owner.userColumn}</th>
                    <th className="pb-3 pr-4 font-medium">{ui.owner.planColumn}</th>
                    <th className="pb-3 pr-4 font-medium">{ui.owner.costColumn}</th>
                    <th className="pb-3 font-medium">{ui.owner.runsColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.highCostUsers.map((user) => (
                    <tr
                      key={user.userId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-foreground">
                        {user.displayName}
                      </td>
                      <td className="py-3 pr-4 uppercase text-[var(--text-secondary)]">
                        {user.plan}
                      </td>
                      <td className="py-3 pr-4 text-[var(--error)]">
                        {formatOwnerUsd(user.estimatedCostUsd, true)}
                      </td>
                      <td className="py-3 text-[var(--text-secondary)]">{user.runCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={ui.owner.dataSourcesTitle}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {snapshot.dataSources.map((source) => (
            <li
              key={source.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4"
            >
              <div>
                <p className="font-medium text-foreground">{source.label}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{source.note}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                  source.connected
                    ? "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/25"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
                )}
              >
                {source.connected
                  ? ui.owner.sourceConnected
                  : ui.owner.sourcePending}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
