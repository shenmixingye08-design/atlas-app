"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayMeasured, displayYen } from "@/lib/owner/revenue-agent/display";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type Snapshot = {
  copy: { product: string; audience: string; path: string; recommendedPlanName: string; recommendedPriceJpy: number };
  lpStatus: string;
  todayPost: { hook: string; contentId: string; xShort: string; landingURL: string };
  publishedCount: number | null;
  uniqueClicks: number | null;
  counts: Record<string, number | null>;
  liveCashYen: number | null;
  dropoff: string;
  nextAction: { facts: string; hypothesis: string; nextChange: string; success: string; revert: string };
  goals: Record<string, "met" | "unmet">;
  posts: Array<{ day: number; kind: string; contentId: string; hook: string; xShort: string }>;
};

function goalLabel(state: "met" | "unmet"): string {
  return state === "met" ? "達成" : "未達";
}

export function FirstRevenuePanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/owner/first-revenue", { cache: "no-store" });
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
    const response = await fetch("/api/owner/first-revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "更新できませんでした");
    await load();
  }

  if (!snapshot) return <p className="text-sm">{error ?? "読み込み中…"}</p>;

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-semibold">初売上スプリント</h2>
      <p className="text-sm">商品: {snapshot.copy.product}</p>
      <p className="text-sm">対象者: {snapshot.copy.audience}</p>
      <p className="text-sm">
        LP: <a className="underline" href={snapshot.copy.path}>{snapshot.copy.path}</a> · {snapshot.lpStatus}
      </p>
      <p className="text-sm">
        おすすめプラン: {snapshot.copy.recommendedPlanName} {snapshot.copy.recommendedPriceJpy}円
      </p>
      <p className="text-xs">今日の投稿案: {snapshot.todayPost.hook}</p>
      <div className="grid gap-1 text-sm">
        <p>投稿済み数: {displayMeasured(snapshot.publishedCount)}</p>
        <p>LP表示: {displayMeasured(snapshot.counts.offer_lp_viewed)}</p>
        <p>ユニーククリック: {displayMeasured(snapshot.uniqueClicks)}</p>
        <p>無料登録: {displayMeasured(snapshot.counts.signup_completed)}</p>
        <p>初回成功: {displayMeasured(snapshot.counts.first_use_succeeded)}</p>
        <p>Checkout開始: {displayMeasured(snapshot.counts.checkout_started)}</p>
        <p>有料契約: {displayMeasured(snapshot.counts.checkout_completed)}</p>
        <p>入金済売上（livemodeのみ）: {displayYen(snapshot.liveCashYen)}</p>
        <p>最大離脱地点: {snapshot.dropoff}</p>
      </div>
      <p className="text-xs">最初の無料登録: {goalLabel(snapshot.goals.signup)}</p>
      <p className="text-xs">最初の初回成功: {goalLabel(snapshot.goals.firstSuccess)}</p>
      <p className="text-xs">最初のCheckout: {goalLabel(snapshot.goals.checkout)}</p>
      <p className="text-xs">最初の有料契約: {goalLabel(snapshot.goals.paid)}</p>
      <p className="text-xs">最初の実入金: {goalLabel(snapshot.goals.liveCash)}</p>
      <p className="text-xs">事実: {snapshot.nextAction.facts}</p>
      <p className="text-xs">仮説: {snapshot.nextAction.hypothesis}</p>
      <p className="text-xs">次の1アクション: {snapshot.nextAction.nextChange}</p>
      <p className="text-xs">成功条件: {snapshot.nextAction.success}</p>
      <p className="text-xs">戻す条件: {snapshot.nextAction.revert}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void run({ action: "approve_lp" })}>
          LPを公開承認
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void run({ action: "draft_lp" })}>
          noindexに戻す
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(snapshot.todayPost.xShort)}
        >
          今日の短文をコピー
        </Button>
      </div>
      <label className="block text-sm">
        手動投稿URL
        <input
          className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2"
          value={postUrl}
          onChange={(event) => setPostUrl(event.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        onClick={() => {
          if (!postUrl.startsWith("http")) {
            setError("投稿URLがないため成功扱いしません。");
            return;
          }
          setError(null);
          void run({
            action: "manual_publish",
            contentId: snapshot.todayPost.contentId,
            postUrl,
          }).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "記録できません");
          });
        }}
      >
        手動投稿済みにする
      </Button>
      <ol className="list-decimal pl-5 text-xs">
        {snapshot.posts.map((post) => (
          <li key={post.contentId}>
            {post.day}日目 {post.kind}: {post.hook}
          </li>
        ))}
      </ol>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
    </Card>
  );
}
