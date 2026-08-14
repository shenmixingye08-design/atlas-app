import Link from "next/link";

import { cn } from "@/lib/design-system/cn";
import {
  USAGE_CTA_SEE_PLANS,
  USAGE_METER_LABEL,
  formatRemainingCount,
  formatSecondaryUpgradeLine,
  formatUpgradeLine,
  formatUsageFraction,
  formatUsageHeadline,
  shouldShowUpgradeCta,
  type UsageItemView,
} from "@/lib/billing/usage-awareness";
import { siteConfig } from "@/lib/config/site";

function levelClass(level: UsageItemView["level"]): string {
  if (level === "exhausted" || level === "critical") {
    return "border-[var(--error)]/30 bg-[var(--error-bg)]";
  }
  if (level === "warning") {
    return "border-[var(--border-strong)] bg-[var(--surface-muted)]";
  }
  return "border-[var(--border-subtle)] bg-[var(--card)]";
}

export function UsageItemCard({ item }: { item: UsageItemView }) {
  const showCta = shouldShowUpgradeCta(item.level) && Boolean(item.primaryUpgrade);
  const upgrade = formatUpgradeLine(item);
  const more = formatSecondaryUpgradeLine(item);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border px-4 py-3",
        levelClass(item.level),
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {USAGE_METER_LABEL[item.id]}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {item.unlimited ? "上限なし" : formatUsageFraction(item)}
        </p>
      </div>
      <p
        className={cn(
          "mt-1 text-sm",
          item.level === "exhausted" || item.level === "critical"
            ? "font-medium text-foreground"
            : "text-[var(--text-secondary)]",
        )}
      >
        {item.level === "normal"
          ? formatRemainingCount(item)
          : formatUsageHeadline(item)}
      </p>
      {item.level === "exhausted" ? (
        <p className="mt-1 text-caption text-[var(--text-secondary)]">
          {item.resetLabel}
        </p>
      ) : null}
      {showCta && upgrade ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">{upgrade}</p>
          {more ? (
            <p className="text-caption text-[var(--text-muted)]">{more}</p>
          ) : null}
          <Link
            href={siteConfig.billingSettingsPath}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground"
          >
            {USAGE_CTA_SEE_PLANS}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
