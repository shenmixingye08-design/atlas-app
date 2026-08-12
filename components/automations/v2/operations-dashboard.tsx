"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import { fetchAutomationOperationsSummary } from "@/lib/automation-platform/client";
import { formatDateTimeInUserTimeZone } from "@/lib/datetime/display-timezone";
import { cn } from "@/lib/design-system/cn";

const TONE_CLASS: Record<
  AutomationOperationsSummary["todayWork"][number]["tone"],
  string
> = {
  success: "text-[var(--success,#1a7f4b)]",
  warning: "text-[var(--warning,#b45309)]",
  danger: "text-[var(--danger)]",
  muted: "text-[var(--muted)]",
  info: "text-[var(--accent)]",
};

export function OperationsDashboard({
  enabled,
}: {
  enabled: boolean;
}) {
  const [summary, setSummary] = useState<AutomationOperationsSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    void fetchAutomationOperationsSummary()
      .then((next) => {
        setSummary(next);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "運用状況を読み込めませんでした",
        );
      });
  }, [enabled]);

  useEffect(() => {
    load();
    if (!enabled) return;
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load, enabled]);

  if (!enabled) return null;

  if (error && !summary) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm text-[var(--danger)]">{error}</p>
        <button
          type="button"
          className="mt-2 text-sm text-accent underline"
          onClick={load}
        >
          再読み込み
        </button>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        運用状況を準備しています…
      </section>
    );
  }

  const cards = [
    { label: "稼働中", value: summary.counts.activeAutomations },
    { label: "一時停止", value: summary.counts.pausedAutomations },
    { label: "承認待ち", value: summary.counts.awaitingApproval },
    { label: "入力待ち", value: summary.counts.needsInput },
    { label: "実行中", value: summary.counts.running },
    { label: "本日成功", value: summary.counts.succeededToday },
    { label: "本日失敗", value: summary.counts.failedToday },
  ] as const;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-title">今日AIが行う仕事</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            次に確認・承認・復旧が必要なことを先に示します。
          </p>
        </div>
        <Link
          href="/automations/runs"
          className="shrink-0 text-sm text-accent underline"
        >
          実行履歴
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-3 text-center"
          >
            <p className="text-[11px] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {summary.nextRun ? (
        <p className="text-sm text-[var(--text-secondary)]">
          次の実行:{" "}
          <Link href={summary.nextRun.href} className="font-medium text-accent">
            {summary.nextRun.name}
          </Link>{" "}
          （
          {formatDateTimeInUserTimeZone(summary.nextRun.nextRunAt, {
            dateStyle: "medium",
          })}
          ）
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-medium">本日のタイムライン</h3>
        {summary.todayWork.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            本日の予定・実行はまだありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {summary.todayWork.slice(0, 12).map((item, index) => (
              <li key={`${item.href}-${index}`}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surface-muted)]"
                >
                  <span className="w-12 shrink-0 tabular-nums text-sm text-[var(--muted)]">
                    {item.timeLabel}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {item.title}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        TONE_CLASS[item.tone],
                      )}
                    >
                      {item.statusLabel}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary.attention.length > 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-medium">対応が必要</h3>
          <ul className="mt-3 space-y-2">
            {summary.attention.slice(0, 8).map((item) => (
              <li key={`${item.kind}-${item.href}`}>
                <Link
                  href={item.href}
                  className="block rounded-xl bg-[var(--surface-muted)] px-3 py-3"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {item.subtitle}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.recentArtifacts.length > 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-medium">最近完成した成果物</h3>
          <ul className="mt-3 space-y-2">
            {summary.recentArtifacts.map((artifact) => (
              <li key={artifact.id}>
                <Link
                  href={artifact.href}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surface-muted)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {artifact.label}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {artifact.automationName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-accent">開く</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
