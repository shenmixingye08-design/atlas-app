import Link from "next/link";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type OwnerNavProps = {
  active:
    | "dashboard"
    | "simulator"
    | "featureFlags"
    | "apiUsage"
    | "errorMonitoring"
    | "popularityRanking"
    | "costRanking"
    | "cancellationAnalysis"
    | "betaUsers"
    | "systemStatus"
    | "anonymousUserAnalysis"
    | "billingWebhook"
    | "notifications"
    | "employeeTeam";
};

const LINKS = [
  { id: "dashboard" as const, href: "/owner", label: ui.owner.navDashboard },
  {
    id: "simulator" as const,
    href: "/owner/simulator",
    label: ui.owner.navSimulator,
  },
  {
    id: "featureFlags" as const,
    href: "/owner/feature-flags",
    label: ui.owner.navFeatureFlags,
  },
  {
    id: "apiUsage" as const,
    href: "/owner/api-usage",
    label: ui.owner.navApiUsage,
  },
  {
    id: "errorMonitoring" as const,
    href: "/owner/error-monitoring",
    label: ui.owner.navErrorMonitoring,
  },
  {
    id: "popularityRanking" as const,
    href: "/owner/popularity-ranking",
    label: ui.owner.navPopularityRanking,
  },
  {
    id: "costRanking" as const,
    href: "/owner/cost-ranking",
    label: ui.owner.navCostRanking,
  },
  {
    id: "cancellationAnalysis" as const,
    href: "/owner/cancellation-analysis",
    label: ui.owner.navCancellationAnalysis,
  },
  {
    id: "betaUsers" as const,
    href: "/owner/beta-users",
    label: ui.owner.navBetaUsers,
  },
  {
    id: "systemStatus" as const,
    href: "/owner/system-status",
    label: ui.owner.navSystemStatus,
  },
  {
    id: "anonymousUserAnalysis" as const,
    href: "/owner/anonymous-user-analysis",
    label: ui.owner.navAnonymousUserAnalysis,
  },
  {
    id: "billingWebhook" as const,
    href: "/owner/billing-webhook",
    label: ui.owner.navBillingWebhook,
  },
  {
    id: "notifications" as const,
    href: "/owner/notifications",
    label: ui.owner.navNotifications,
  },
  {
    id: "employeeTeam" as const,
    href: "/owner/employee-team",
    label: ui.owner.navEmployeeTeam,
  },
];

export function OwnerNav({ active }: OwnerNavProps) {
  return (
    <nav
      aria-label={ui.owner.navLabel}
      className="-mx-1 flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-4 scrollbar-none"
    >
      {LINKS.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          className={cn(
            "touch-target shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-ring whitespace-nowrap",
            active === link.id
              ? "bg-[var(--surface-muted)] text-foreground ring-1 ring-[var(--border-strong)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
