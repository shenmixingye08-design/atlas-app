"use client";

import { useEffect, useState } from "react";

import { fetchBillingSummary } from "@/lib/billing";
import {
  formatPreUseHint,
  type UsageMeterId,
} from "@/lib/billing/usage-awareness";
import { subscribeBillingUsageChanged } from "@/lib/billing/refresh-events";

type UsageRemainingHintProps = {
  meterId: UsageMeterId;
};

/** Compact remaining-count hint shown just before a user action. */
export function UsageRemainingHint({ meterId }: UsageRemainingHintProps) {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const summary = await fetchBillingSummary();
        const item = summary.usageAwareness.items.find((row) => row.id === meterId);
        if (cancelled || !item) return;
        setHint(formatPreUseHint(item));
      } catch {
        if (!cancelled) setHint(null);
      }
    };

    void load();
    const unsubscribe = subscribeBillingUsageChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [meterId]);

  if (!hint) return null;

  return (
    <p
      className="text-sm text-[var(--text-secondary)]"
      role="status"
    >
      {hint}
    </p>
  );
}
