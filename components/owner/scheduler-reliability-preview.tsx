"use client";

import { useEffect } from "react";

/**
 * Visual preview for screenshots — mirrors owner dashboard layout with seeded numbers.
 * Does not call live APIs.
 */
export function SchedulerReliabilityPreview() {
  useEffect(() => {
    // no-op: static preview
  }, []);

  const stats = [
    { label: "Queue長", value: "12" },
    { label: "Running数", value: "3" },
    { label: "Retry数", value: "5" },
    { label: "Failure率", value: "2%" },
    { label: "平均実行時間", value: "18.4s" },
    { label: "P95", value: "42.1s" },
    { label: "P99", value: "58.0s" },
    { label: "予定遅延 P95", value: "12.4s" },
    { label: "Recovery成功率", value: "100%" },
    { label: "Duplicate率", value: "0%" },
    { label: "Scheduler", value: "OK" },
    { label: "Worker", value: "OK" },
  ];

  return (
    <div
      className="space-y-6"
      data-testid="scheduler-reliability-preview"
    >
      <p className="text-sm text-[var(--text-secondary)]">
        1分tick · Lease · Heartbeat · Recovery · ±60s SLA
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
          >
            <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
        <h2 className="font-semibold">Alerts</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">アラートなし</p>
      </section>
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
        <h2 className="font-semibold">実行中表示（モバイル）</h2>
        <div className="mt-3 max-w-sm space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase text-[var(--brand)]">
            実行状態
          </p>
          <p className="text-base font-semibold">実行中</p>
          <p className="text-sm text-[var(--text-secondary)]">
            処理を実行しています。途中で止まっても自動復旧します。
          </p>
          <p className="text-sm font-medium">推定残り時間（目安）: 約2〜3分</p>
        </div>
      </section>
    </div>
  );
}
