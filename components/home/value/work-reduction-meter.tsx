"use client";

import { useState } from "react";

import {
  trackValueEvent,
  type ValueHomeSnapshot,
  type ValuePeriod,
} from "@/lib/value";
import { cn } from "@/lib/design-system/cn";

const TABS: ValuePeriod[] = ["today", "week", "month", "total"];

export function WorkReductionMeter({
  snapshot,
}: {
  snapshot: ValueHomeSnapshot;
}) {
  const [period, setPeriod] = useState<ValuePeriod>("today");
  const meter =
    snapshot.meters.find((item) => item.period === period) ?? snapshot.meters[0]!;

  return (
    <section
      aria-labelledby="value-meter-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 sm:p-5"
      data-testid="work-reduction-meter"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2
          id="value-meter-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          仕事削減メーター
        </h2>
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const label =
              snapshot.meters.find((m) => m.period === tab)?.label ?? tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setPeriod(tab);
                  trackValueEvent("value_meter_tab_changed", { period: tab });
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  period === tab
                    ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">削減時間</dt>
          <dd className="text-base font-semibold">{meter.hoursSavedLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">削減クリック数</dt>
          <dd className="text-base font-semibold tabular-nums">
            {meter.clicksSaved}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">自動化数</dt>
          <dd className="text-base font-semibold tabular-nums">
            {meter.automationCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">成果物数</dt>
          <dd className="text-base font-semibold tabular-nums">
            {meter.deliverableCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Memory適用数</dt>
          <dd className="text-base font-semibold tabular-nums">
            {meter.memoryApplyCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">完了した仕事</dt>
          <dd className="text-base font-semibold tabular-nums">
            {meter.jobsCompleted}
          </dd>
        </div>
      </dl>
    </section>
  );
}
