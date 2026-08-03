"use client";

import {
  buildFirstValueRoi,
  formatRoiBasis,
  formatRoiMinutes,
  type FirstValueRoiView,
} from "@/lib/first-value";

export type RoiPanelProps = {
  measuredTodayMinutes?: number | null;
  measuredWeekMinutes?: number | null;
  measuredMonthMinutes?: number | null;
  estimatedTodayMinutes?: number | null;
  estimatedWeekMinutes?: number | null;
  estimatedMonthMinutes?: number | null;
  automationSuccessRate?: number | null;
  memoryApplyRate?: number | null;
};

function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function FirstValueRoiPanel(props: RoiPanelProps) {
  const roi: FirstValueRoiView = buildFirstValueRoi({
    measuredTodayMinutes: props.measuredTodayMinutes ?? null,
    measuredWeekMinutes: props.measuredWeekMinutes ?? null,
    measuredMonthMinutes: props.measuredMonthMinutes ?? null,
    estimatedTodayMinutes: props.estimatedTodayMinutes ?? null,
    estimatedWeekMinutes: props.estimatedWeekMinutes ?? null,
    estimatedMonthMinutes: props.estimatedMonthMinutes ?? null,
    automationSuccessRate: props.automationSuccessRate ?? null,
    memoryApplyRate: props.memoryApplyRate ?? null,
  });

  const slices = [roi.today, roi.week, roi.month];

  return (
    <section
      aria-labelledby="fv-roi-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
    >
      <h2
        id="fv-roi-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        削減時間 · ROI
      </h2>
      <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        推定と実測を区別して表示します
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {slices.map((slice) => (
          <div
            key={slice.label}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-2"
          >
            <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {slice.label}
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-[var(--text-primary)]">
              {formatRoiMinutes(slice)}
            </dd>
            <dd className="text-[10px] text-[var(--text-muted)]">
              {slice.minutes == null ? "未計測" : formatRoiBasis(slice.basis)}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[var(--text-muted)]">Automation成功率</dt>
          <dd className="font-semibold tabular-nums">
            {pct(roi.automationSuccessRate)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Memory適用率</dt>
          <dd className="font-semibold tabular-nums">
            {pct(roi.memoryApplyRate)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
