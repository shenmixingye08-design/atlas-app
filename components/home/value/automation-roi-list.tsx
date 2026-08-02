"use client";

import Link from "next/link";

import { formatHoursMinutes, type ValueHomeSnapshot } from "@/lib/value";

export function AutomationRoiList({
  snapshot,
}: {
  snapshot: ValueHomeSnapshot;
}) {
  return (
    <section
      aria-labelledby="automation-roi-heading"
      className="space-y-3"
      data-testid="automation-roi-list"
    >
      <h2
        id="automation-roi-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        自動化ごとの価値
      </h2>
      {snapshot.automationRoi.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          自動化を追加すると、節約時間と成功率がここに表示されます。
        </p>
      ) : (
        <ul className="space-y-2">
          {snapshot.automationRoi.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
              >
                <p className="font-semibold text-[var(--text-primary)]">{row.name}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  節約 {formatHoursMinutes(row.minutesSaved)} · 利用 {row.runCount}回 ·
                  成功率 {row.successRatePercent ?? "—"}% · 失敗率{" "}
                  {row.failureRatePercent ?? "—"}%
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
