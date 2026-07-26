"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

export type OwnerNavActive =
  | "dashboard"
  | "aiAssistant"
  | "aiCost"
  | "deliverableCost"
  | "profitAnalysis"
  | "departments"
  | "jobs"
  | "errorMonitoring"
  | "systemStatus"
  | "users"
  | "stripe"
  | "deliverableAnalytics"
  | "apiCostLog"
  | "analytics"
  | "simulator"
  | "featureFlags"
  | "apiUsage"
  | "popularityRanking"
  | "costRanking"
  | "cancellationAnalysis"
  | "betaUsers"
  | "externalServices"
  | "envStatus"
  | "anonymousUserAnalysis"
  | "billingWebhook"
  | "notifications"
  | "employeeTeam"
  | "accountDeletions"
  | "auditLog"
  | "disasterRecovery"
  | "automationExecutionLogs";

type OwnerNavProps = {
  active: OwnerNavActive;
};

type NavItem = {
  id: OwnerNavActive;
  href: string;
  label: string;
};

type NavGroup = {
  title: string;
  items: readonly NavItem[];
};

const GROUPS: readonly NavGroup[] = [
  {
    title: "経営",
    items: [
      { id: "dashboard", href: "/owner", label: "経営ダッシュボード" },
      {
        id: "aiAssistant",
        href: "/owner/ai-assistant",
        label: "AI経営アシスタント",
      },
      { id: "analytics", href: "/owner/analytics", label: "分析グラフ" },
      { id: "stripe", href: "/owner/stripe", label: "Stripe管理" },
      { id: "profitAnalysis", href: "/owner/profit-analysis", label: "利益分析" },
      { id: "simulator", href: "/owner/simulator", label: ui.owner.navSimulator },
    ],
  },
  {
    title: "AI・原価",
    items: [
      { id: "aiCost", href: "/owner/ai-cost", label: "AI原価管理" },
      { id: "apiCostLog", href: "/owner/api-cost-log", label: "APIコストログ" },
      { id: "deliverableCost", href: "/owner/deliverable-cost", label: "成果物原価" },
      {
        id: "deliverableAnalytics",
        href: "/owner/deliverable-analytics",
        label: "成果物分析",
      },
      { id: "departments", href: "/owner/departments", label: "AI部署モニター" },
      { id: "apiUsage", href: "/owner/api-usage", label: ui.owner.navApiUsage },
      { id: "costRanking", href: "/owner/cost-ranking", label: ui.owner.navCostRanking },
    ],
  },
  {
    title: "監視",
    items: [
      { id: "jobs", href: "/owner/jobs", label: "ジョブ監視" },
      {
        id: "errorMonitoring",
        href: "/owner/error-monitoring",
        label: "エラーセンター",
      },
      { id: "systemStatus", href: "/owner/system-status", label: "システム監視" },
      {
        id: "automationExecutionLogs",
        href: "/owner/automation-execution-logs",
        label: "定期実行ログ",
      },
      {
        id: "disasterRecovery",
        href: "/owner/disaster-recovery",
        label: ui.owner.navDisasterRecovery,
      },
    ],
  },
  {
    title: "ユーザー",
    items: [
      { id: "users", href: "/owner/users", label: "ユーザー管理" },
      { id: "betaUsers", href: "/owner/beta-users", label: ui.owner.navBetaUsers },
      {
        id: "cancellationAnalysis",
        href: "/owner/cancellation-analysis",
        label: ui.owner.navCancellationAnalysis,
      },
      {
        id: "accountDeletions",
        href: "/owner/account-deletions",
        label: ui.owner.navAccountDeletions,
      },
      {
        id: "anonymousUserAnalysis",
        href: "/owner/anonymous-user-analysis",
        label: ui.owner.navAnonymousUserAnalysis,
      },
    ],
  },
  {
    title: "運営",
    items: [
      {
        id: "featureFlags",
        href: "/owner/feature-flags",
        label: ui.owner.navFeatureFlags,
      },
      {
        id: "billingWebhook",
        href: "/owner/billing-webhook",
        label: ui.owner.navBillingWebhook,
      },
      {
        id: "externalServices",
        href: "/owner/external-services",
        label: ui.owner.navExternalServices,
      },
      { id: "envStatus", href: "/owner/env-status", label: ui.owner.navEnvStatus },
      { id: "auditLog", href: "/owner/audit-log", label: ui.owner.navAuditLog },
      {
        id: "notifications",
        href: "/owner/notifications",
        label: ui.owner.navNotifications,
      },
      {
        id: "employeeTeam",
        href: "/owner/employee-team",
        label: ui.owner.navEmployeeTeam,
      },
      {
        id: "popularityRanking",
        href: "/owner/popularity-ranking",
        label: ui.owner.navPopularityRanking,
      },
    ],
  },
];

export function OwnerNav({ active }: OwnerNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mb-4 flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm font-medium text-foreground lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>メニュー</span>
        <span className="text-[var(--text-muted)]">{open ? "閉じる" : "開く"}</span>
      </button>

      <nav
        aria-label={ui.owner.navLabel}
        className={cn(
          "owner-nav-enter space-y-6 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2",
          open ? "block" : "hidden lg:block",
        )}
      >
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-ring",
                      active === item.id
                        ? "bg-[var(--accent-muted)] font-semibold text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(0,113,227,0.18)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
