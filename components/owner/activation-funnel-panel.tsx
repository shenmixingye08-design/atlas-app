"use client";

import { useEffect, useState } from "react";

import type { ActivationFunnelResult } from "@/lib/activation/funnel";
import { Card } from "@/components/ui/card";

function formatMs(value: number | null): string {
  if (value === null) return "まだ十分ではありません";
  const minutes = Math.round(value / 60000);
  if (minutes < 1) return `${Math.round(value / 1000)}秒`;
  if (minutes < 120) return `${minutes}分`;
  return `${Math.round(minutes / 60)}時間`;
}

export function ActivationFunnelPanel() {
  const [funnel, setFunnel] = useState<ActivationFunnelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/owner/activation-funnel")
      .then(async (response) => {
        if (!response.ok) throw new Error("forbidden");
        return (await response.json()) as { funnel: ActivationFunnelResult };
      })
      .then((payload) => setFunnel(payload.funnel))
      .catch(() => setError("管理者だけが確認できます。"));
  }, []);

  if (error) {
    return (
      <p className="text-sm text-[var(--error)]" role="alert">
        {error}
      </p>
    );
  }
  if (!funnel) return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;

  const rows: Array<[string, string]> = [
    ["登録者数", String(funnel.registered)],
    ["オンボーディング開始率", `${Math.round(funnel.onboardingStartedRate * 100)}%`],
    ["目的選択率", `${Math.round(funnel.goalSelectedRate * 100)}%`],
    ["最初の依頼送信率", `${Math.round(funnel.firstRequestSubmittedRate * 100)}%`],
    ["最初の依頼成功率", `${Math.round(funnel.firstRequestCompletedRate * 100)}%`],
    ["最初の結果閲覧率", `${Math.round(funnel.firstResultViewedRate * 100)}%`],
    ["最初の自動化作成率", `${Math.round(funnel.firstAutomationCreatedRate * 100)}%`],
    ["最初の自動化成功率", `${Math.round(funnel.firstAutomationSuccessRate * 100)}%`],
    ["外部連携成功率", `${Math.round(funnel.integrationSuccessRate * 100)}%`],
    ["Paywall表示率", `${Math.round(funnel.paywallViewedRate * 100)}%`],
    ["Checkout開始率", `${Math.round(funnel.checkoutStartedRate * 100)}%`],
    ["有料化率", `${Math.round(funnel.paidRate * 100)}%`],
    ["登録→依頼", formatMs(funnel.timeToFirstValue.signupToFirstRequestMs)],
    ["登録→完了", formatMs(funnel.timeToFirstValue.signupToFirstCompletedMs)],
    ["登録→閲覧", formatMs(funnel.timeToFirstValue.signupToFirstViewedMs)],
    ["登録→自動化成功", formatMs(funnel.timeToFirstValue.signupToFirstAutomationSuccessMs)],
    ["登録→有料", formatMs(funnel.timeToFirstValue.signupToPaidMs)],
    ["離脱が多いstep", funnel.dropOffStep ?? "まだ十分ではありません"],
  ];

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Activation Funnel</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{funnel.note}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
            <dt className="text-caption text-[var(--text-secondary)]">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {funnel.errorsByStep.length > 0 ? (
        <ul className="text-sm text-[var(--text-secondary)]">
          {funnel.errorsByStep.map((item) => (
            <li key={`${item.step}:${item.reason}`}>
              {item.step} / {item.reason}: {item.count}件
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
