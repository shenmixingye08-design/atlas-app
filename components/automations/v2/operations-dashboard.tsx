"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import { fetchAutomationOperationsSummary } from "@/lib/automation-platform/client";
import { formatDateTimeInUserTimeZone } from "@/lib/datetime/display-timezone";
import { cn } from "@/lib/design-system/cn";
import { RecentDeliverables } from "@/components/automation-first/recent-deliverables";
import { SectionHeader } from "@/components/automation-first/page-header";
import { formatNextRunDateTime } from "@/lib/automation-first/home-data";

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
      <section className="ui-card ui-card-pad">
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
      <section className="ui-card ui-card-pad text-sm text-[var(--muted)]">
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
      <SectionHeader
        title="今日AIが行う仕事"
        description="次に確認・承認・復旧が必要なことを先に示します。"
        action={
          <Link href="/automations/runs" className="ui-link">
            実行履歴
          </Link>
        }
      />

      <dl className="ui-card grid grid-cols-4 gap-y-3 px-2 py-3 lg:grid-cols-7">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0 px-1 text-center">
            <dt className="truncate text-[length:var(--text-meta)] text-[var(--text-muted)]">
              {card.label}
            </dt>
            <dd
              className={cn(
                "text-lg font-semibold tabular-nums tracking-tight",
                card.value === 0 && "text-[var(--text-muted)]",
              )}
            >
              {card.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.nextRun ? (
        <p className="text-sm text-[var(--text-secondary)]">
          次の実行:{" "}
          <Link href={summary.nextRun.href} className="font-semibold text-[var(--brand)] hover:underline">
            {summary.nextRun.name}
          </Link>{" "}
          （
          {formatDateTimeInUserTimeZone(summary.nextRun.nextRunAt, {
            dateStyle: "medium",
          })}
          ）
        </p>
      ) : null}

      {summary.attention.length > 0 ? (
        <div>
          <SectionHeader heading="h3" title="対応が必要" />
          <ul className="ui-card ui-list">
            {summary.attention.slice(0, 8).map((item) => (
              <li key={`${item.kind}-${item.href}`}>
                <Link href={item.href} className="ui-row ui-row-link focus-ring">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-sm">{item.title}</span>
                    <span className="block text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                      {item.subtitle}
                    </span>
                  </span>
                  <span aria-hidden className="ui-chevron">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <SectionHeader heading="h3" title="本日のタイムライン" />
        {summary.todayWork.length === 0 ? (
          <p className="ui-card ui-card-pad text-sm text-[var(--muted)]">
            本日の予定・実行はまだありません。
          </p>
        ) : (
          <ul className="ui-card ui-list">
            {summary.todayWork.slice(0, 12).map((item, index) => (
              <li key={`${item.href}-${index}`}>
                <Link href={item.href} className="ui-row ui-row-link focus-ring">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                    {item.timeLabel}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className={cn("text-xs", TONE_CLASS[item.tone])}>
                      {item.statusLabel}
                    </span>
                  </span>
                  <span aria-hidden className="ui-chevron">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecentDeliverables
        items={summary.recentArtifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.automationName,
          detail: artifact.label,
          href: artifact.href,
          meta: formatNextRunDateTime(artifact.createdAt),
          url: artifact.url,
        }))}
      />
    </section>
  );
}
