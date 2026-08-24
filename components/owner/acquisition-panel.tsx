"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayMeasured, displayUsd, displayYen } from "@/lib/owner/revenue-agent/display";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type Snapshot = {
  campaignId: string;
  reward: string;
  evidence: Array<{
    id: string;
    title: string;
    fact: string;
    status: string;
    limitLabel: string | null;
  }>;
  useCases: Array<{ slug: string; title: string; status: string }>;
  calendar: Array<{
    date: string;
    ideas: Array<{
      category: string;
      hook: string;
      measuredCashYen: number | null;
      skip: boolean;
    }>;
  }>;
  channels: Array<{
    channel: string;
    posts: number | null;
    produced: number | null;
    published: number | null;
    uniqueClicks: number | null;
    diagnosisStarted: number | null;
    diagnosisCompleted: number | null;
    signups: number | null;
    firstSuccess: number | null;
    paid: number | null;
    cashYen: number | null;
    aiCostUsd: number | null;
    adYen: number | null;
    vendorYen: number | null;
    costPerSignup: number | null;
    costPerPaid: number | null;
    roas: number | null;
  }>;
  pack: {
    items: Array<{
      contentId: string;
      channel: string;
      title: string;
      body: string;
      cta: string;
      utmUrl: string;
      autoPublish: boolean;
      canQueueToRevenueAgent: boolean;
      requiresPostUrl: boolean;
      status: string;
      script15?: string;
      script30?: string;
      hook3s?: string;
      telops?: string[];
      cuts?: string[];
      thumb?: string;
      screenHref: string;
    }>;
  };
  verdict: string;
  suggestion: {
    facts: string;
    interpretation: string;
    nextChange: string;
    verifyDays: number;
    success: string;
    stop: string;
  };
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

export function AcquisitionPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [selectedContentId, setSelectedContentId] = useState("");
  const [spendYen, setSpendYen] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/owner/acquisition", { cache: "no-store" });
    if (!response.ok) throw new Error("読み込みに失敗しました");
    setSnapshot((await response.json()) as Snapshot);
  }, []);

  useEffect(() => {
    return scheduleMountWork(() => {
      void load().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "読み込み失敗");
      });
    });
  }, [load]);

  async function run(body: Record<string, unknown>) {
    const response = await fetch("/api/owner/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "更新できませんでした");
    await load();
  }

  if (!snapshot) {
    return <p className="text-sm">{error ?? "読み込み中…"}</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-display">集客エンジン</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          診断→登録→初回成功→入金を campaign {snapshot.campaignId} で追います。
          未取得は 0 ではなく「—」。紹介特典は {snapshot.reward}。この画面から自動投稿しません。
        </p>
        <p className="text-xs">判定: {snapshot.verdict}</p>
        <p className="text-xs">事実: {snapshot.suggestion.facts}</p>
        <p className="text-xs">解釈: {snapshot.suggestion.interpretation}</p>
        <p className="text-xs">次: {snapshot.suggestion.nextChange}</p>
        <p className="text-xs">
          検証期間 {snapshot.suggestion.verifyDays}日 / 成功: {snapshot.suggestion.success} /
          停止: {snapshot.suggestion.stop} / Owner承認が必要
        </p>
      </header>

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">証拠台帳</h2>
        {snapshot.evidence.map((row) => (
          <div key={row.id} className="border-b border-[var(--border)] py-2 text-sm">
            <p className="font-medium">
              {row.title} · {row.status}
            </p>
            <p>{row.fact}</p>
            <p className="text-xs">{row.limitLabel ?? "上限: プラン定義を参照"}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(
                [
                  "unverified",
                  "verified_preview",
                  "verified_production",
                  "approved_for_marketing",
                  "rejected",
                  "expired",
                ] as const
              ).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="ghost"
                  onClick={() => void run({ action: "evidence_status", id: row.id, status })}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">ユースケース公開</h2>
        {snapshot.useCases.map((row) => (
          <div key={row.slug} className="flex flex-wrap items-center gap-2 text-sm">
            <a className="underline" href={`/use-cases/${row.slug}`}>
              {row.title}
            </a>
            <span>{row.status}</span>
            <Button
              size="sm"
              onClick={() => void run({ action: "usecase_status", slug: row.slug, status: "approved" })}
            >
              公開承認
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void run({ action: "usecase_status", slug: row.slug, status: "draft" })}
            >
              noindexに戻す
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">14日カレンダー</h2>
        <p className="text-xs">1日3案。承認して出すのは原則1案。投稿しないを選べます。</p>
        {snapshot.calendar.map((day) => (
          <div key={day.date} className="text-sm">
            <p className="font-medium">{day.date}</p>
            <ul className="list-disc pl-5">
              {day.ideas.map((idea) => (
                <li key={`${day.date}-${idea.category}`}>
                  {idea.skip ? "投稿しない · " : ""}
                  {idea.category}: {idea.hook} · 入金 {displayYen(idea.measuredCashYen)}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run({ action: "calendar_skip", date: day.date, category: idea.category })
                    }
                  >
                    投稿しない
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Card className="space-y-2 p-4 overflow-x-auto">
        <h2 className="text-lg font-semibold">チャネル別採算</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th>媒体</th>
              <th>投稿</th>
              <th>制作</th>
              <th>公開</th>
              <th>クリック</th>
              <th>診断開始</th>
              <th>診断完了</th>
              <th>登録</th>
              <th>初回成功</th>
              <th>有料</th>
              <th>入金</th>
              <th>AI</th>
              <th>外注</th>
              <th>広告</th>
              <th>1登録</th>
              <th>1有料</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.channels.map((row) => (
              <tr key={row.channel}>
                <td>{row.channel}</td>
                <td>{displayMeasured(row.posts)}</td>
                <td>{displayMeasured(row.produced)}</td>
                <td>{displayMeasured(row.published)}</td>
                <td>{displayMeasured(row.uniqueClicks)}</td>
                <td>{displayMeasured(row.diagnosisStarted)}</td>
                <td>{displayMeasured(row.diagnosisCompleted)}</td>
                <td>{displayMeasured(row.signups)}</td>
                <td>{displayMeasured(row.firstSuccess)}</td>
                <td>{displayMeasured(row.paid)}</td>
                <td>{displayYen(row.cashYen)}</td>
                <td>{displayUsd(row.aiCostUsd)}</td>
                <td>{displayYen(row.vendorYen)}</td>
                <td>{displayYen(row.adYen)}</td>
                <td>{displayYen(row.costPerSignup)}</td>
                <td>{displayYen(row.costPerPaid)}</td>
                <td>{row.roas == null ? "—" : row.roas.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-end gap-2 pt-2 text-sm">
          <label>
            広告/外注費（円）
            <input
              className="mt-1 block rounded-md border border-[var(--border)] px-3 py-2"
              value={spendYen}
              onChange={(event) => setSpendYen(event.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void run({
                action: "set_spend",
                kind: "ad",
                channel: "x",
                yen: spendYen ? Number(spendYen) : null,
              })
            }
          >
            X広告費を保存
          </Button>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-semibold">投稿素材パック</h2>
        <p className="text-xs">
          この画面は自動投稿しません。Xは収益エージェントの承認キューへ。未連携媒体はコピーと手動投稿URL確認まで。
        </p>
        <Button size="sm" onClick={() => void run({ action: "generate_pack" })}>
          素材パックを作る
        </Button>
        {snapshot.pack.items.map((item) => (
          <div key={item.contentId} className="rounded-md border border-[var(--border)] p-3 text-sm">
            <p className="font-medium">
              {item.title} · {item.channel} · {item.contentId} · {item.status}
            </p>
            <p className="whitespace-pre-wrap">{item.body}</p>
            <p>CTA: {item.cta}</p>
            <p>UTM: {item.utmUrl}</p>
            <p>実在画面: {item.screenHref}</p>
            {item.script15 ? <p>15秒: {item.script15}</p> : null}
            {item.thumb ? <p>サムネ文言: {item.thumb}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(item.body)}
              >
                全文コピー
              </Button>
              {item.script15 || item.script30 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      [item.hook3s, item.script15, item.script30].filter(Boolean).join("\n"),
                    )
                  }
                >
                  台本コピー
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(item.cta)}
              >
                CTAコピー
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(item.utmUrl)}
              >
                UTM URLコピー
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadText(
                    `${item.contentId}.txt`,
                    [
                      item.title,
                      item.body,
                      item.cta,
                      item.utmUrl,
                      item.script15 ?? "",
                      item.cuts?.join(" / ") ?? "",
                    ].join("\n"),
                  )
                }
              >
                素材をダウンロード
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedContentId(item.contentId)}>
                この素材を選択
              </Button>
            </div>
            {item.canQueueToRevenueAgent ? (
              <p className="mt-2 text-xs">
                Xは収益エージェントでOwner承認後に投稿できます。ここからは投稿成功にしません。
              </p>
            ) : (
              <p className="mt-2 text-xs">自動投稿なし。投稿URL未入力では成功扱いしません。</p>
            )}
          </div>
        ))}
        <label className="block text-sm">
          手動投稿URL（選択中 {selectedContentId || "未選択"}）
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2"
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            if (!selectedContentId) {
              setError("素材を選択してください。");
              return;
            }
            if (!postUrl.startsWith("http")) {
              setError("投稿URLがないため、投稿成功として記録しません。");
              return;
            }
            setError(null);
            void run({
              action: "manual_publish",
              contentId: selectedContentId,
              postUrl,
            }).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "記録できませんでした");
            });
          }}
        >
          手動投稿済みにする
        </Button>
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      </Card>
    </div>
  );
}
