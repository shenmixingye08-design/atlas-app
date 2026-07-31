"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type {
  BetaOpsPeriod,
  BetaOpsPeriodKpis,
  BetaOpsSnapshot,
} from "@/lib/owner/beta-ops/types";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

const PERIODS: BetaOpsPeriod[] = ["today", "week", "month"];

const PERIOD_LABEL: Record<BetaOpsPeriod, string> = {
  today: "今日",
  week: "今週",
  month: "今月",
};

const VERDICT: Record<
  BetaOpsPeriodKpis["publishVerdict"],
  { label: string; emoji: string; className: string }
> = {
  go: {
    label: "公開可",
    emoji: "🟢",
    className: "text-emerald-600",
  },
  delay: {
    label: "延期",
    emoji: "🟡",
    className: "text-amber-600",
  },
  kill: {
    label: "中止検討",
    emoji: "🔴",
    className: "text-rose-600",
  },
  insufficient_data: {
    label: "データ不足",
    emoji: "⚪",
    className: "text-[var(--foreground-muted)]",
  },
};

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}秒`;
}

function MetricBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-6 text-center last:border-b-0">
      <p className="text-sm text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

export function BetaOpsPanel() {
  const [snapshot, setSnapshot] = useState<BetaOpsSnapshot | null>(null);
  const [period, setPeriod] = useState<BetaOpsPeriod>("today");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/beta-ops", { cache: "no-store" });
      if (!response.ok) throw new Error("β指標を読み込めませんでした");
      setSnapshot((await response.json()) as BetaOpsSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snapshot) {
    return <LoadingState message="サービス状態を確認しています" />;
  }
  if (error && !snapshot) {
    return <ErrorState message={error} />;
  }
  if (!snapshot) return null;

  const kpis = snapshot.periods[period];
  const verdict = VERDICT[kpis.publishVerdict];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          β版 — サービス状態
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          招待制 {snapshot.targetUsers.min}–{snapshot.targetUsers.max}人 /
          登録β {snapshot.betaUserCount}人 / ユーザー一覧は表示しません
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={period === item ? "primary" : "secondary"}
            onClick={() => setPeriod(item)}
          >
            {PERIOD_LABEL[item]}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
          更新
        </Button>
      </div>

      <Card padding="lg" className="mx-auto max-w-md">
        <MetricBlock
          label="仕事完了率"
          value={formatRate(kpis.completionRatePercent)}
        />
        <MetricBlock
          label="平均時間"
          value={formatSeconds(kpis.avgCompletionSeconds)}
        />
        <MetricBlock
          label="エラー率"
          value={formatRate(kpis.failureRatePercent)}
        />
        <MetricBlock
          label="継続率（7日）"
          value={formatRate(kpis.retention7Percent)}
        />
        <MetricBlock
          label="紹介率"
          value={formatRate(kpis.referralRatePercent)}
        />
        <MetricBlock
          label="課金率"
          value={formatRate(kpis.paidConversionPercent)}
        />
        <div className="py-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">公開判定</p>
          <p className={cn("mt-2 text-4xl font-semibold", verdict.className)}>
            {verdict.emoji}
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {verdict.label} · 依頼 {kpis.requestCount}件
          </p>
        </div>
      </Card>

      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">補足指標</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--foreground-muted)]">途中離脱率</dt>
            <dd className="font-medium">{formatRate(kpis.dropoutRatePercent)}</dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">再実行率</dt>
            <dd className="font-medium">{formatRate(kpis.retryRatePercent)}</dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">同じ仕事の再依頼</dt>
            <dd className="font-medium">{formatRate(kpis.reRequestRatePercent)}</dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">30日継続率</dt>
            <dd className="font-medium">{formatRate(kpis.retention30Percent)}</dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">運営導線</h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          <li>
            <Link className="text-accent underline" href={snapshot.channels.termsUrl}>
              利用規約
            </Link>
          </li>
          <li>
            <Link
              className="text-accent underline"
              href={snapshot.channels.privacyUrl}
            >
              プライバシー
            </Link>
          </li>
          <li>
            <Link
              className="text-accent underline"
              href={snapshot.channels.bugReportUrl}
            >
              障害報告
            </Link>
          </li>
          <li>
            <Link
              className="text-accent underline"
              href={snapshot.channels.feedbackUrl}
            >
              フィードバック
            </Link>
          </li>
          <li>
            <Link
              className="text-accent underline"
              href={snapshot.channels.contactUrl}
            >
              問い合わせ
            </Link>
          </li>
          <li>
            <Link
              className="text-accent underline"
              href={snapshot.channels.statusUrl}
            >
              公開ステータス
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" href="/owner/beta-users">
              招待リスト
            </Link>
          </li>
        </ul>
      </Card>

      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">改善履歴</h2>
        {snapshot.improvementLog.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            まだありません。実データ根拠がある変更だけを記録してください。
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {snapshot.improvementLog.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <p className="font-medium text-foreground">{entry.title}</p>
                <p className="mt-1 text-[var(--foreground-muted)]">
                  {entry.evidence}
                </p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {entry.at} · {entry.period}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
