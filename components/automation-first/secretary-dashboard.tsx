"use client";

import Link from "next/link";

import type { SecretaryRoiSummary } from "@/lib/first-value/roi";
import type { SecretaryLevel } from "@/lib/first-value/secretary-level";
import type { SecretaryProactiveItem } from "@/lib/home/secretary-proactive";
import { cn } from "@/lib/design-system/cn";

export type SecretaryDashboardProps = {
  todayCompleted: number;
  todayHoursSaved: number;
  runningCount: number;
  todayScheduled: number;
  suggestion: SecretaryProactiveItem | null;
  roi: SecretaryRoiSummary;
  level: SecretaryLevel;
  automationSuccessRate: number | null;
  memoryUseCount: number;
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[length:var(--text-label)] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SecretaryDashboard({
  todayCompleted,
  todayHoursSaved,
  runningCount,
  todayScheduled,
  suggestion,
  roi,
  level,
  automationSuccessRate,
  memoryUseCount,
}: SecretaryDashboardProps) {
  return (
    <section
      aria-labelledby="secretary-dashboard-heading"
      className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
            AI秘書ダッシュボード
          </p>
          <h2
            id="secretary-dashboard-heading"
            className="mt-1 text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            今日の仕事の進み具合
          </h2>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-right">
          <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            秘書レベル {level.level}
          </p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {level.title}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="今日終わった仕事" value={`${todayCompleted}件`} />
        <Metric
          label="削減時間"
          value={
            todayHoursSaved > 0
              ? todayHoursSaved < 1
                ? `約${Math.round(todayHoursSaved * 60)}分`
                : `約${todayHoursSaved}時間`
              : "—"
          }
          hint={roi.basis === "measured" ? "実測" : "推定"}
        />
        <Metric label="今実行中" value={`${runningCount}件`} />
        <Metric label="今日の予定" value={`${todayScheduled}件`} />
      </div>

      <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
        <Metric
          label="今週の削減"
          value={
            roi.weekHoursSaved > 0 ? `約${roi.weekHoursSaved}時間` : "—"
          }
          hint={roi.basis === "measured" ? "実測" : "推定"}
        />
        <Metric
          label="今月の削減"
          value={
            roi.monthHoursSaved > 0 ? `約${roi.monthHoursSaved}時間` : "—"
          }
          hint={roi.basis === "measured" ? "実測" : "推定"}
        />
        <Metric
          label="Automation成功率"
          value={
            automationSuccessRate == null ? "—" : `${automationSuccessRate}%`
          }
        />
      </div>

      <div
        className={cn(
          "rounded-[var(--radius-md)] border px-4 py-3",
          "border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface))]",
        )}
      >
        <p className="text-[length:var(--text-label)] font-medium text-[var(--text-muted)]">
          ¥{roi.planPriceJpy.toLocaleString("ja-JP")} の価値（{roi.basis === "measured" ? "実測" : "推定"}）
        </p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
          {roi.label}
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
          {roi.detail}
        </p>
        <p className="mt-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          Memory利用 {memoryUseCount} 回 · Memory完成率{" "}
          {Math.round(level.memoryCompletionRate * 100)}%
        </p>
      </div>

      {suggestion ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3">
          <p className="text-[length:var(--text-label)] font-medium text-[var(--brand)]">
            AIから提案（1件）
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            次はこれを自動化できます — {suggestion.title}
          </p>
          <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            {suggestion.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={suggestion.continueHref}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
            >
              進める
            </Link>
            <Link
              href={suggestion.confirmHref}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              内容を見る
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          仕事が進むと、次に自動化できる提案を1件だけご用意します。
        </p>
      )}
    </section>
  );
}
