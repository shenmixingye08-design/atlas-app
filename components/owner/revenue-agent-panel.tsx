"use client";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  displayMeasured,
  displayRate,
  displayUsd,
  displayYen,
} from "@/lib/owner/revenue-agent/display";
import type {
  RevenueAgentSnapshot,
  RevenueContent,
  RevenueFunnelRange,
  RevenueGoals,
} from "@/lib/owner/revenue-agent/types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `エラー (${response.status})`;
  } catch {
    return `エラー (${response.status})`;
  }
}

function metricLabel(value: number | null): string {
  return value == null ? "未取得" : String(value);
}

const RANGE_LABEL: Record<RevenueFunnelRange, string> = {
  "7d": "7日",
  "30d": "30日",
  all: "全期間",
};

export function RevenueAgentPanel() {
  const [snapshot, setSnapshot] = useState<RevenueAgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<Partial<RevenueContent>>({});
  const [goalsDraft, setGoalsDraft] = useState<RevenueGoals | null>(null);
  const [adSpendDraft, setAdSpendDraft] = useState("");
  const [range, setRange] = useState<RevenueFunnelRange>("30d");
  const [tab, setTab] = useState<"funnel" | "improve">("funnel");
  const [improve, setImprove] = useState<Record<string, unknown> | null>(null);

  const applyItemDraft = (item: RevenueContent) => {
    setDraft({
      title: item.title,
      hook: item.hook,
      body: item.body,
      cta: item.cta,
      scheduledAt: item.scheduledAt,
    });
  };

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/owner/revenue-agent?range=${range}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(await readError(response));
    const next = (await response.json()) as RevenueAgentSnapshot;
    setSnapshot(next);
    setGoalsDraft(next.goals);
    setAdSpendDraft(next.adSpendYen == null ? "" : String(next.adSpendYen));
    if (tab === "improve") {
      const improveRes = await fetch("/api/owner/revenue-agent/improve", {
        cache: "no-store",
      });
      if (improveRes.ok) {
        setImprove((await improveRes.json()) as Record<string, unknown>);
      }
    }
    const currentId = selectedIdRef.current;
    if (currentId) {
      const current = next.items.find((item) => item.id === currentId);
      if (current) applyItemDraft(current);
    }
  }, [range, tab]);

  useEffect(() => {
    return scheduleMountWork(() => {
      void load().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      });
    });
  }, [load]);

  const selected = useMemo(
    () => snapshot?.items.find((item) => item.id === selectedId) ?? null,
    [snapshot, selectedId],
  );

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : label);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot || !goalsDraft) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-caption">運営者専用 · β</p>
        <h1 className="text-display">収益エージェント</h1>
        <p className="text-body max-w-3xl text-[var(--text-secondary)]">
          副業者・個人事業主へMINERVOTを認知させ、LP訪問・無料登録・有料登録を増やすための内部機能です。
          生成物は承認キューに入ります。存在しない実績は作りません。
          未取得は 0 ではなく「—」です。
        </p>
        <p className="text-sm">
          <a className="underline" href="/owner/acquisition">
            集客エンジン（診断・台帳・カレンダー）
          </a>
        </p>
        <div className="flex gap-2">
          <Button
            variant={tab === "funnel" ? "primary" : "secondary"}
            onClick={() => setTab("funnel")}
          >
            帰属ファネル
          </Button>
          <Button
            variant={tab === "improve" ? "primary" : "secondary"}
            onClick={() => setTab("improve")}
          >
            収益改善
          </Button>
        </div>
      </header>

      {tab === "improve" ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">収益改善</h2>
          <p className="text-xs text-[var(--text-muted)]">
            契約MRRはサブスクリプション記録×プラン定義月額です。入金済売上とは別です。LTVは推定しません。
          </p>
          {improve ? (
            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <p>入金済売上: {displayYen(improve.cashRevenueYen as number | null)}</p>
              <p>契約MRR: {displayYen(improve.contractedMrrYen as number | null)}</p>
              <p>新規MRR: {displayYen(improve.newMrrYen as number | null)}</p>
              <p>解約MRR: {displayYen(improve.churnMrrYen as number | null)}</p>
              <p>Expansion MRR: {displayYen(improve.expansionMrrYen as number | null)}</p>
              <p>Contraction MRR: {displayYen(improve.contractionMrrYen as number | null)}</p>
              <p>純増MRR: {displayYen(improve.netMrrYen as number | null)}</p>
              <p>無料→有料: {displayRate(improve.freeToPaidRate as number | null)}</p>
              <p>初回成功率: {displayRate(improve.firstSuccessRate as number | null)}</p>
              <p>D7継続: {displayRate(improve.d7Retention as number | null)}</p>
              <p>D30継続: {displayRate(improve.d30Retention as number | null)}</p>
              <p>有料解約率: {displayRate(improve.paidCancelRate as number | null)}</p>
              <p>ARPU: {displayYen(improve.arpuYen as number | null)}</p>
              <p>LTV: {String(improve.ltvLabel ?? "データ不足")}</p>
              <p>Checkout失敗: {displayMeasured(improve.checkoutFailed as number | null)}</p>
              <p>paid_at_risk: {displayMeasured(improve.paidAtRisk as number | null)}</p>
              <p>最大離脱: {typeof improve.dropOff === "string" ? improve.dropOff : "—"}</p>
            </div>
          ) : (
            <p className="text-sm">読み込み中…</p>
          )}
          {Array.isArray(improve?.suggestions)
            ? (improve.suggestions as Array<Record<string, string>>).map((row) => (
                <div key={row.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                  <p>離脱: {row.dropOff}</p>
                  <p>期間: {row.period}</p>
                  <p>実測: {row.measured}</p>
                  <p>推奨: {row.change}</p>
                  <p>検証: {row.howToVerify}</p>
                  <p>監視: {row.watch}</p>
                  <p>戻す条件: {row.revert}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void run("承認を記録できませんでした", async () => {
                          const response = await fetch(
                            "/api/owner/revenue-agent/improve",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                decision: "approved",
                                id: row.id,
                              }),
                            },
                          );
                          if (!response.ok) throw new Error(await readError(response));
                        })
                      }
                    >
                      承認（料金は変えない）
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void run("却下を記録できませんでした", async () => {
                          const response = await fetch(
                            "/api/owner/revenue-agent/improve",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                decision: "rejected",
                                id: row.id,
                              }),
                            },
                          );
                          if (!response.ok) throw new Error(await readError(response));
                        })
                      }
                    >
                      却下
                    </Button>
                  </div>
                </div>
              ))
            : null}
          {snapshot.contentRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    <th className="py-2 pr-3">投稿</th>
                    <th className="py-2 pr-3">入金済売上</th>
                    <th className="py-2">有料契約</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.contentRows.map((row) => (
                    <tr key={row.contentId} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3">{displayYen(row.cashRevenueYen)}</td>
                      <td className="py-2">{displayMeasured(row.paidContracts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">投稿別入金売上: 未取得</p>
          )}
        </Card>
      ) : null}

      {tab === "funnel" ? (
      <>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">実測ファネル</h2>
          <div className="flex gap-2">
            {(["7d", "30d", "all"] as const).map((value) => (
              <Button
                key={value}
                variant={range === value ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => {
                  setRange(value);
                }}
              >
                {RANGE_LABEL[value]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          入金済売上は Stripe の invoice.paid のみ。プラン表示価格からは推定しません。
        </p>
        <div className="grid gap-2 md:grid-cols-3 text-sm">
          <p>公開投稿数: {displayMeasured(snapshot.funnel.publishedPosts)}</p>
          <p>クリック数: {displayMeasured(snapshot.funnel.clicks)}</p>
          <p>ユニーク訪問数: {displayMeasured(snapshot.funnel.uniqueVisits)}</p>
          <p>無料登録数: {displayMeasured(snapshot.funnel.signups)}</p>
          <p>初回依頼成功: {displayMeasured(snapshot.funnel.firstJobs)}</p>
          <p>初回自動化成功: {displayMeasured(snapshot.funnel.firstAutomations)}</p>
          <p>Checkout開始: {displayMeasured(snapshot.funnel.checkoutStarted)}</p>
          <p>有料契約数: {displayMeasured(snapshot.funnel.paidContracts)}</p>
          <p>入金済売上: {displayYen(snapshot.funnel.cashRevenueYen)}</p>
          <p>CTR: {displayRate(snapshot.funnel.ctr)}</p>
          <p>クリック→登録率: {displayRate(snapshot.funnel.clickToSignupRate)}</p>
          <p>登録→初回成功率: {displayRate(snapshot.funnel.signupToFirstSuccessRate)}</p>
          <p>登録→有料化率: {displayRate(snapshot.funnel.signupToPaidRate)}</p>
          <p>投稿1件あたり登録: {displayMeasured(snapshot.funnel.signupsPerPost)}</p>
          <p>投稿1件あたり入金: {displayYen(snapshot.funnel.cashPerPostYen)}</p>
          <p>OpenAI実測/算定: {displayUsd(snapshot.funnel.openaiCostUsd)}</p>
          <p>広告費（手動）: {displayYen(snapshot.funnel.adSpendYen)}</p>
          <p>有料獲得単価: {displayYen(snapshot.funnel.paidAcquisitionCostYen)}</p>
          <p>ROAS: {displayMeasured(snapshot.funnel.roas)}</p>
          <p>返金（別指標）: {displayYen(snapshot.funnel.refundsYen)}</p>
        </div>
        <label className="block text-sm">
          手動広告費（円・空欄=未取得）
          <input
            className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            value={adSpendDraft}
            onChange={(event) => setAdSpendDraft(event.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run("広告費を保存できませんでした", async () => {
              const raw = adSpendDraft.trim();
              const response = await fetch("/api/owner/revenue-agent", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...goalsDraft,
                  adSpendYen: raw === "" ? null : Number(raw),
                }),
              });
              if (!response.ok) throw new Error(await readError(response));
            })
          }
        >
          広告費を保存
        </Button>
      </Card>

      {error ? (
        <p className="rounded-lg bg-[var(--error-bg)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">目標</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            期間開始
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.periodStart}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, periodStart: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            期間終了
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.periodEnd}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, periodEnd: event.target.value })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            LP URL
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.lpUrl}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, lpUrl: event.target.value })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            主要ターゲット
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.targetAudience}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, targetAudience: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            1日の投稿目標
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.dailyPostTarget}
              onChange={(event) =>
                setGoalsDraft({
                  ...goalsDraft,
                  dailyPostTarget: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={goalsDraft.requireApproval}
              onChange={(event) =>
                setGoalsDraft({
                  ...goalsDraft,
                  requireApproval: event.target.checked,
                })
              }
            />
            承認必須
          </label>
          <label className="text-sm md:col-span-2">
            CTA
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={goalsDraft.cta}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, cta: event.target.value })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            ブランドトーン
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              rows={2}
              value={goalsDraft.brandTone}
              onChange={(event) =>
                setGoalsDraft({ ...goalsDraft, brandTone: event.target.value })
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            禁止表現（改行区切り）
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              rows={3}
              value={goalsDraft.bannedPhrases.join("\n")}
              onChange={(event) =>
                setGoalsDraft({
                  ...goalsDraft,
                  bannedPhrases: event.target.value.split("\n"),
                })
              }
            />
          </label>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            void run("目標を保存できませんでした", async () => {
              const response = await fetch("/api/owner/revenue-agent", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(goalsDraft),
              });
              if (!response.ok) throw new Error(await readError(response));
            })
          }
        >
          目標を保存
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">X連携</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {snapshot.xConnection.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void run("生成に失敗しました", async () => {
                const response = await fetch("/api/owner/revenue-agent/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "daily" }),
                });
                if (!response.ok) throw new Error(await readError(response));
              })
            }
          >
            今日の企画を生成（3案以上）
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("追加生成に失敗しました", async () => {
                const response = await fetch("/api/owner/revenue-agent/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "force" }),
                });
                if (!response.ok) throw new Error(await readError(response));
              })
            }
          >
            追加で生成
          </Button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          最終生成日: {snapshot.lastGeneratedOn ?? "未実施"} · AIはまとめて1回 ·
          未接続のXを成功扱いしません
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">学習（実測のみ）</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {snapshot.insights.disclaimer}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          公開 {snapshot.insights.sampleSize} 件 · 信頼度 {snapshot.insights.confidence}
        </p>
        <ul className="text-sm">
          <li>LP訪問率: {metricLabel(snapshot.insights.lpVisitRate)}</li>
          <li>登録率: {metricLabel(snapshot.insights.signupRate)}</li>
          <li>有料転換率: {metricLabel(snapshot.insights.paidConversionRate)}</li>
          <li>投稿1本あたり売上: {metricLabel(snapshot.insights.revenuePerPostYen)}</li>
        </ul>
        {snapshot.insights.recommendations.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {snapshot.insights.recommendations.map((row) => (
              <li key={row.contentId} className="rounded-md border border-[var(--border)] p-3">
                <p className="font-medium">
                  {row.title} · {row.verdict === "hold" ? "判断保留" : row.verdict}
                </p>
                <p>{row.reason}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  入金 {displayYen(row.measured.revenueYen)} / 契約{" "}
                  {displayMeasured(row.measured.paidContracts)} / 初回成功{" "}
                  {displayMeasured(row.measured.firstSuccesses)} / 登録{" "}
                  {displayMeasured(row.measured.signups)} / クリック{" "}
                  {displayMeasured(row.measured.uniqueClicks)}
                </p>
                {row.dataGap ? <p>データギャップ: {row.dataGap}</p> : null}
                <p>次に試す軸: {row.nextCtaOrAxis}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">コンテンツ別実績</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="py-2 pr-3">投稿日</th>
                <th className="py-2 pr-3">テーマ</th>
                <th className="py-2 pr-3">CTA</th>
                <th className="py-2 pr-3">状態</th>
                <th className="py-2 pr-3">X URL</th>
                <th className="py-2 pr-3">クリック</th>
                <th className="py-2 pr-3">登録</th>
                <th className="py-2 pr-3">初回成功</th>
                <th className="py-2 pr-3">有料契約</th>
                <th className="py-2 pr-3">入金済売上</th>
                <th className="py-2 pr-3">AIコスト</th>
                <th className="py-2">判定</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.contentRows.map((row) => (
                <tr key={row.contentId} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-3">{row.publishedAt?.slice(0, 10) ?? "—"}</td>
                  <td className="py-2 pr-3">{row.title}</td>
                  <td className="py-2 pr-3">{row.cta}</td>
                  <td className="py-2 pr-3">{row.status}</td>
                  <td className="py-2 pr-3">
                    {row.postUrl ? (
                      <a className="underline" href={row.postUrl} target="_blank" rel="noreferrer">
                        投稿
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">{displayMeasured(row.clicks)}</td>
                  <td className="py-2 pr-3">{displayMeasured(row.signups)}</td>
                  <td className="py-2 pr-3">{displayMeasured(row.firstSuccesses)}</td>
                  <td className="py-2 pr-3">{displayMeasured(row.paidContracts)}</td>
                  <td className="py-2 pr-3">{displayYen(row.cashRevenueYen)}</td>
                  <td className="py-2 pr-3">{displayUsd(row.aiCostUsd)}</td>
                  <td className="py-2">{row.verdictLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshot.contentRows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">まだコンテンツがありません。</p>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">承認キュー</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="py-2 pr-3">状態</th>
                <th className="py-2 pr-3">種類</th>
                <th className="py-2 pr-3">投稿先</th>
                <th className="py-2 pr-3">タイトル</th>
                <th className="py-2">予約</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]"
                  onClick={() => {
                    selectedIdRef.current = item.id;
                    setSelectedId(item.id);
                    applyItemDraft(item);
                  }}
                >
                  <td className="py-2 pr-3">{item.status}</td>
                  <td className="py-2 pr-3">{item.kind}</td>
                  <td className="py-2 pr-3">{item.platform}</td>
                  <td className="py-2 pr-3">{item.title}</td>
                  <td className="py-2">{item.scheduledAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshot.items.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">まだ企画がありません。</p>
        ) : null}
      </Card>

      {selected ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">企画の確認</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {selected.contentId} · campaign {selected.campaignId} · {selected.generationMode}
          </p>
          <p className="text-sm">想定対象者: {selected.assumedTarget}</p>
          <p className="text-sm">具体的な悩み: {selected.painPoint || "—"}</p>
          <p className="text-sm">投稿の狙い: {selected.intent || selected.reason}</p>
          <p className="text-sm">利用例: {selected.featureExample || "—"}</p>
          <p className="text-sm">登録導線: {selected.signupPath}</p>
          <p className="text-sm">
            禁止表現: {selected.claimCheck.ok ? "問題なし" : selected.claimCheck.hits.join(" / ")}
          </p>
          <label className="block text-sm">
            タイトル
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={draft.title ?? ""}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            冒頭フック
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={draft.hook ?? ""}
              onChange={(event) => setDraft({ ...draft, hook: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            本文（公開前に投稿先とあわせて確認）
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              rows={8}
              value={draft.body ?? ""}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            投稿先 {selected.platform} · 追跡 {selected.trackingUrl} · UTM {selected.utmUrl}
          </p>
          {selected.video ? (
            <div className="space-y-2 rounded-md border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">短尺（手動投稿）</p>
              <p>台本: {selected.video.script}</p>
              <p>テロップ: {selected.video.telops.join(" / ")}</p>
              <p>キャプション: {selected.video.caption}</p>
              <p>ハッシュタグ: {selected.video.hashtags.join(" ")}</p>
              <p>サムネ: {selected.video.thumbnailCopy}</p>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    [
                      selected.video?.script,
                      selected.video?.caption,
                      selected.video?.hashtags.join(" "),
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                  )
                }
              >
                台本をコピー
              </Button>
            </div>
          ) : null}
          <label className="block text-sm">
            投稿日時
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              value={draft.scheduledAt?.slice(0, 16) ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  scheduledAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run("保存に失敗しました", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "edit", ...draft }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              編集を保存
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run("承認できませんでした", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "approve" }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              承認
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run("却下できませんでした", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "reject" }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              却下
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run("予約できませんでした", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "schedule",
                        scheduledAt: draft.scheduledAt,
                      }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              日時指定
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run("再生成に失敗しました", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "regenerate" }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              再生成
            </Button>
            {selected.platform === "x" ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void run("投稿に失敗しました", async () => {
                    const response = await fetch(
                      `/api/owner/revenue-agent/items/${selected.id}/publish`,
                      { method: "POST" },
                    );
                    if (!response.ok) throw new Error(await readError(response));
                  })
                }
              >
                Xへ投稿
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run("更新に失敗しました", async () => {
                    const response = await fetch(
                      `/api/owner/revenue-agent/items/${selected.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "mark_published" }),
                      },
                    );
                    if (!response.ok) throw new Error(await readError(response));
                  })
                }
              >
                手動投稿済み
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run("再実行できませんでした", async () => {
                  const response = await fetch(
                    `/api/owner/revenue-agent/items/${selected.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "retry" }),
                    },
                  );
                  if (!response.ok) throw new Error(await readError(response));
                })
              }
            >
              失敗を再実行
            </Button>
          </div>
          {selected.lastError ? (
            <p className="text-sm text-[var(--error)]">
              {selected.lastError}
              {selected.failedStage ? `（段階: ${selected.failedStage}）` : ""}
              {selected.retryable ? " · 再試行できます" : " · このままでは再試行しません"}
            </p>
          ) : null}
          {selected.postUrl ? (
            <p className="text-sm">
              投稿URL:{" "}
              <a className="underline" href={selected.postUrl} target="_blank" rel="noreferrer">
                {selected.postUrl}
              </a>
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3 text-sm">
            {(
              [
                ["impressions", "imp"],
                ["likes", "いいね"],
                ["replies", "返信"],
                ["reposts", "リポスト"],
                ["linkClicks", "クリック"],
                ["lpVisits", "LP"],
                ["signups", "登録"],
                ["paidConversions", "有料"],
                ["revenueYen", "売上円"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}（空欄=未取得）
                <input
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  defaultValue={selected.metrics[key] ?? ""}
                  onBlur={(event) => {
                    const raw = event.target.value.trim();
                    void run("計測を保存できませんでした", async () => {
                      const response = await fetch(
                        `/api/owner/revenue-agent/items/${selected.id}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "metrics",
                            metrics: { [key]: raw === "" ? null : Number(raw) },
                          }),
                        },
                      );
                      if (!response.ok) throw new Error(await readError(response));
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">生成コスト</h2>
        {snapshot.costs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">まだAI生成はありません。</p>
        ) : (
          <ul className="text-sm">
            {snapshot.costs.slice(0, 8).map((row) => (
              <li key={row.id}>
                {row.at.slice(0, 16)} · {row.model} · in {row.inputTokens} / out{" "}
                {row.outputTokens} · ${row.estimatedCostUsd.toFixed(4)} · 一括
                {row.batchSize}案
              </li>
            ))}
          </ul>
        )}
      </Card>
      </>
      ) : null}
    </div>
  );
}
