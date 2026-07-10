import type { OwnerDashboardSnapshot } from "@/lib/owner/types";
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
  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)]">{ui.owner.pageEyebrow}</p>
        <h1 className="text-display text-foreground">{ui.owner.pageTitle}</h1>
        <p className="max-w-2xl text-body text-[var(--text-secondary)]">
          {ui.owner.pageSubtitle(snapshot.period.label)}
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
          value={formatOwnerUsd(snapshot.revenue.amountUsd)}
          hint={
            snapshot.revenue.isEstimated ? ui.owner.estimatedHint : undefined
          }
          accent="revenue"
        />
        <MetricCard
          label={snapshot.apiCost.label}
          value={formatOwnerUsd(snapshot.apiCost.amountUsd, true)}
          hint={
            snapshot.apiCost.isEstimated ? ui.owner.estimatedHint : undefined
          }
          accent="cost"
        />
        <MetricCard
          label={snapshot.serverCost.label}
          value={formatOwnerUsd(snapshot.serverCost.amountUsd)}
          hint={
            snapshot.serverCost.isEstimated ? ui.owner.estimatedHint : undefined
          }
          accent="cost"
        />
        <MetricCard
          label={snapshot.estimatedProfit.label}
          value={formatOwnerUsd(snapshot.estimatedProfit.amountUsd, true)}
          hint={
            snapshot.estimatedProfit.isEstimated
              ? ui.owner.estimatedHint
              : undefined
          }
          accent="profit"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title={ui.owner.userCountsTitle}>
          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.paidUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.paid}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.freeUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.free}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
              <dt className="text-xs text-[var(--text-secondary)]">{ui.owner.churnedUsers}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {snapshot.users.churned}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title={ui.owner.ecoModeTitle}>
          <p className="text-3xl font-semibold text-[var(--success)]">
            {formatOwnerPercent(snapshot.ecoModeReductionPercent)}
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {ui.owner.ecoModeRuns(snapshot.ecoModeRuns)}
          </p>
        </SectionCard>

        <SectionCard title={ui.owner.stripePayoutTitle}>
          <p className="text-3xl font-semibold">
            {formatOwnerUsd(snapshot.nextStripePayout.amountUsd)}
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {ui.owner.stripePayoutDate(
              formatOwnerDate(snapshot.nextStripePayout.scheduledAt),
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {ui.owner.stripePayoutStatus(snapshot.nextStripePayout.status)}
          </p>
        </SectionCard>
      </div>

      <SectionCard title={ui.owner.mrrTitle}>
        <p className="text-3xl font-semibold text-[var(--success)]">
          {formatOwnerJpy(snapshot.billing.mrrJpy)}
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
        </SectionCard>

        <SectionCard title={ui.owner.highCostUsersTitle}>
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
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          {ui.owner.generatedAt(formatOwnerDate(snapshot.generatedAt))}
        </p>
      </SectionCard>
    </div>
  );
}
