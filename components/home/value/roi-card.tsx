"use client";

import { useEffect } from "react";

import { formatYen, trackValueEvent, type ValueHomeSnapshot } from "@/lib/value";

export function RoiCard({ snapshot }: { snapshot: ValueHomeSnapshot }) {
  const { roi } = snapshot;

  useEffect(() => {
    trackValueEvent("value_roi_viewed", {
      hours: roi.monthHoursSaved,
      wage: roi.impliedHourlyWageJpy,
    });
    trackValueEvent("value_pricing_blurb_viewed", {
      price: roi.planPriceJpy,
    });
  }, [roi.impliedHourlyWageJpy, roi.monthHoursSaved, roi.planPriceJpy]);

  return (
    <section
      aria-labelledby="value-roi-heading"
      className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface-elevated))] p-4 sm:p-5"
      data-testid="value-roi-card"
    >
      <h2
        id="value-roi-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        今月の価値（{formatYen(roi.planPriceJpy)}）
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-primary)] sm:text-base">
        {roi.summary}
      </p>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        {snapshot.pricingBlurb}
      </p>
      {roi.roiMultiple != null ? (
        <p className="mt-2 text-xs font-medium text-[var(--brand)]">
          一般的な時給換算と比べ、約 {roi.roiMultiple} 倍の効率感です。
        </p>
      ) : null}
    </section>
  );
}
