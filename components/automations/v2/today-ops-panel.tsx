"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import { fetchAutomationOperationsSummary } from "@/lib/automation-platform/client";
import { fetchFeatureAvailability } from "@/lib/feature-flags/client";
import { cn } from "@/lib/design-system/cn";

/**
 * Compact "今日の仕事" ops view — structured for future Automation First home
 * integration without rewriting the login home in this phase.
 */
export function TodayOpsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [summary, setSummary] = useState<AutomationOperationsSummary | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchFeatureAvailability()
      .then((flags) => {
        const on = Boolean(
          flags.automation_operations_enabled ||
            flags.automation_dashboard_v2_enabled,
        );
        if (cancelled) return;
        setEnabled(on);
        if (!on) return;
        return fetchAutomationOperationsSummary().then((next) => {
          if (!cancelled) setSummary(next);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled || !summary) return null;

  const tomorrow = summary.todayWork.length;

  return (
    <section className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">今日のAI稼働</h2>
          <p className="text-sm text-[var(--muted)]">
            予定・実行中・承認待ち・失敗をまとめて確認できます。
          </p>
        </div>
        <Link href="/automations" className="text-sm text-accent underline">
          運用へ
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <dt className="text-xs text-[var(--muted)]">実行中</dt>
          <dd className="text-lg font-semibold">{summary.counts.running}</dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <dt className="text-xs text-[var(--muted)]">承認待ち</dt>
          <dd className="text-lg font-semibold">
            {summary.counts.awaitingApproval}
          </dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <dt className="text-xs text-[var(--muted)]">入力待ち</dt>
          <dd className="text-lg font-semibold">{summary.counts.needsInput}</dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <dt className="text-xs text-[var(--muted)]">本日失敗</dt>
          <dd className="text-lg font-semibold">{summary.counts.failedToday}</dd>
        </div>
      </dl>

      <ul className="space-y-2">
        {summary.todayWork.slice(0, 8).map((item, index) => (
          <li key={`${item.href}-${index}`}>
            <Link
              href={item.href}
              className="flex gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surface-muted)]"
            >
              <span className="w-12 shrink-0 tabular-nums text-sm text-[var(--muted)]">
                {item.timeLabel}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span
                  className={cn(
                    "text-xs",
                    item.tone === "danger"
                      ? "text-[var(--danger)]"
                      : item.tone === "warning"
                        ? "text-[var(--warning,#b45309)]"
                        : "text-[var(--muted)]",
                  )}
                >
                  {item.statusLabel}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-[var(--muted)]">
        今日の表示件数: {tomorrow}件 / 明日の予定は自動化詳細の次回実行で確認できます
      </p>
    </section>
  );
}
