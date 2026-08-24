"use client";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  RevenueAgentSnapshot,
  RevenueContent,
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

export function RevenueAgentPanel() {
  const [snapshot, setSnapshot] = useState<RevenueAgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<Partial<RevenueContent>>({});
  const [goalsDraft, setGoalsDraft] = useState<RevenueGoals | null>(null);

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
    const response = await fetch("/api/owner/revenue-agent", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const next = (await response.json()) as RevenueAgentSnapshot;
    setSnapshot(next);
    setGoalsDraft(next.goals);
    const currentId = selectedIdRef.current;
    if (currentId) {
      const current = next.items.find((item) => item.id === currentId);
      if (current) applyItemDraft(current);
    }
  }, []);

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
        </p>
      </header>

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
        <h2 className="text-lg font-semibold">学習（暫定）</h2>
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
            {selected.id} · {selected.generationMode} · 理由: {selected.reason}
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
            投稿先 {selected.platform} · UTM {selected.utmUrl}
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
            <p className="text-sm text-[var(--error)]">{selected.lastError}</p>
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
    </div>
  );
}
