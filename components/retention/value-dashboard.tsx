"use client";

import { useMemo } from "react";

import {
  buildRetentionValueStats,
  getRetentionRatesSummary,
  loadRetentionState,
  recordRetentionActivity,
} from "@/lib/retention";

export function RetentionValueDashboard() {
  const { stats, rates, automationCount } = useMemo(() => {
    recordRetentionActivity();
    const state = loadRetentionState();
    return {
      stats: buildRetentionValueStats(),
      rates: getRetentionRatesSummary(),
      automationCount: state.dayPlan.filter((d) => d.day >= 3 && d.completedAt).length,
    };
  }, []);

  return (
    <section
      aria-labelledby="retention-value-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
      data-testid="retention-value-dashboard"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="retention-value-heading"
            className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            秘書の成果
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Lv.{stats.secretaryLevel} {stats.secretaryLevelLabel}
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          継続 {rates.activeDays}日
          {rates.day7 != null ? ` · D7 ${rates.day7 ? "継続" : "未達"}` : ""}
          {rates.day14 != null ? ` · D14 ${rates.day14 ? "継続" : "未達"}` : ""}
          {rates.day30 != null ? ` · D30 ${rates.day30 ? "継続" : "未達"}` : ""}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[var(--text-muted)]">節約時間</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.estimatedHoursSaved}時間
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">作成件数</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.deliverableCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">自動化成功</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.automationSuccessCount}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">削減工数</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.estimatedMinutesSaved}分
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Automation数</dt>
          <dd className="text-lg font-semibold tabular-nums">{automationCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Memory完成率</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.memoryCompletionPercent}%
          </dd>
        </div>
      </dl>
    </section>
  );
}
