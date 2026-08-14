"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchBillingSummary } from "@/lib/billing";
import { subscribeBillingUsageChanged } from "@/lib/billing/refresh-events";
import {
  USAGE_CTA_SEE_PLANS,
  formatOtherMetersRemain,
  formatUsageHeadline,
  offeredUsageItems,
  shouldShowUpgradeCta,
  takeUsageThresholdNotices,
  type UsageItemView,
} from "@/lib/billing/usage-awareness";
import { siteConfig } from "@/lib/config/site";

/**
 * Post-run notice: only when a threshold is crossed, once per level / month.
 */
export function UsageThresholdWatcher() {
  const [notice, setNotice] = useState<UsageItemView | null>(null);
  const [other, setOther] = useState<string | null>(null);

  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;

    const load = async (fromEvent: boolean) => {
      try {
        const summary = await fetchBillingSummary();
        const items = offeredUsageItems(summary.usageAwareness).filter(
          (item) => item.level !== "normal",
        );
        const due = takeUsageThresholdNotices(
          items,
          {
            month: summary.usageAwareness.month,
            planId: summary.usageAwareness.planId,
          },
          storage,
        );
        if (!fromEvent && due.length === 0) return;
        const next = due[0] ?? null;
        setNotice(next);
        setOther(
          next?.level === "exhausted"
            ? formatOtherMetersRemain(summary.usageAwareness.items)
            : null,
        );
      } catch {
        // Unauthenticated pages must stay silent.
      }
    };

    const unsubscribe = subscribeBillingUsageChanged(() => {
      void load(true);
    });
    return unsubscribe;
  }, []);

  if (!notice) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="status"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow-lg)]">
        <p className="text-sm font-medium text-foreground">
          {formatUsageHeadline(notice)}
        </p>
        {other ? (
          <p className="mt-1 text-caption text-[var(--text-secondary)]">{other}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          {shouldShowUpgradeCta(notice.level) && notice.primaryUpgrade ? (
            <Link
              href={siteConfig.billingSettingsPath}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--accent)]"
            >
              {USAGE_CTA_SEE_PLANS}
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="min-h-[44px] px-2 text-sm text-[var(--text-secondary)]"
            onClick={() => setNotice(null)}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
