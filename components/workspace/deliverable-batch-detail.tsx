"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchDeliverableBatchClient,
  patchDeliverableBatchItemClient,
  runDeliverableBatchAction,
} from "@/lib/deliverable-batch/client";
import type { DeliverableBatchWithItems } from "@/lib/deliverable-batch/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "待ち",
  generating: "作成中",
  ready: "完成",
  approved: "承認済み",
  failed: "失敗",
  cancelled: "取消",
  draft: "下書き",
  generating_sample: "試作中",
  sample_ready: "試作待ち",
  partially_failed: "一部失敗",
  completed: "完了",
};

export function DeliverableBatchDetail({ batchId }: { batchId: string }) {
  const [view, setView] = useState<DeliverableBatchWithItems | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [applyCandidate, setApplyCandidate] = useState(false);

  const reload = useCallback(() => {
    void fetchDeliverableBatchClient(batchId)
      .then(setView)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込めませんでした。"),
      );
  }, [batchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!view) {
    return (
      <p className="text-sm text-[var(--text-secondary)]" role="status">
        {error ?? "読み込み中…"}
      </p>
    );
  }

  const run = async (
    action: Parameters<typeof runDeliverableBatchAction>[1],
    extra?: Record<string, unknown>,
  ) => {
    setBusy(true);
    try {
      const next = await runDeliverableBatchAction(batchId, action, {
        itemIds: selected,
        approveSample: true,
        applyStyleCandidate: applyCandidate,
        styleNote: applyCandidate ? view.batch.styleCandidate : undefined,
        ...extra,
      });
      setView(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const allIds = view.items.map((item) => item.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  return (
    <div className="mx-auto max-w-3xl space-y-5 overflow-x-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-reduce:transition-none">
      <header className="space-y-2">
        <p className="text-caption text-accent">まとめて作成</p>
        <h1 className="text-xl font-semibold text-foreground">{view.batch.name}</h1>
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          {STATUS_LABEL[view.batch.status] ?? view.batch.status} ・ {view.items.length}件
        </p>
      </header>

      {error ? (
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}

      {view.batch.styleCandidate ? (
        <Card padding="md" className="space-y-2">
          <p className="text-sm font-medium">試作の修正を残りへ反映しますか？</p>
          <p className="text-sm text-[var(--text-secondary)]">{view.batch.styleCandidate}</p>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={applyCandidate}
              onChange={(event) => setApplyCandidate(event.target.checked)}
            />
            この文体・構成を残りに使う（Memoryにはまだ保存しません）
          </label>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 min-[390px]:flex-row min-[390px]:flex-wrap">
        <Button className="min-h-[44px]" disabled={busy} onClick={() => void run("sample")}>
          試作する
        </Button>
        <Button
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => void run("generate_remaining")}
        >
          残りを生成
        </Button>
        <Button
          variant="secondary"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => void run("retry_failed")}
        >
          失敗だけ再試行
        </Button>
        <Button
          variant="secondary"
          className="min-h-[44px]"
          disabled={busy || selected.length === 0}
          onClick={() => void run("regenerate_selected")}
        >
          選択を再生成
        </Button>
        <Button
          variant="secondary"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => void run("approve_all")}
        >
          まとめて承認
        </Button>
        <Button
          variant="ghost"
          className="min-h-[44px]"
          disabled={busy || selected.length === 0}
          onClick={() => void run("delete_items")}
        >
          選択を削除
        </Button>
        <a
          href={`/api/deliverable-batches/${batchId}/zip`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border-subtle)] px-4 text-sm"
        >
          全件ZIP
        </a>
        <a
          href={`/api/deliverable-batches/${batchId}/zip?successOnly=1`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-[var(--accent-foreground,#fff)]"
        >
          成功分をZIP
        </a>
        <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => void run("clone")}>
          複製
        </Button>
        <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => void run("cancel")}>
          取消
        </Button>
      </div>

      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => setSelected(event.target.checked ? allIds : [])}
        />
        すべて選択
      </label>

      <section aria-labelledby="delivery-list-heading" className="space-y-2">
        <h2 id="delivery-list-heading" className="text-sm font-semibold">
          納品一覧
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-caption text-[var(--text-secondary)]">
                <th className="py-2 pr-3">番号</th>
                <th className="py-2 pr-3">タイトル</th>
                <th className="py-2 pr-3">状態</th>
                <th className="py-2 pr-3">形式</th>
                <th className="py-2 pr-3">ファイル</th>
                <th className="py-2">作成</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr key={`row-${item.id}`} className="border-t border-[var(--border-subtle)]">
                  <td className="py-2 pr-3">{item.order + 1}</td>
                  <td className="py-2 pr-3">{item.title}</td>
                  <td className="py-2 pr-3">{STATUS_LABEL[item.status]}</td>
                  <td className="py-2 pr-3">{item.outputFormat}</td>
                  <td className="py-2 pr-3">{item.fileName ?? "—"}</td>
                  <td className="py-2">{item.createdAt.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ul className="space-y-3">
        {view.items.map((item) => (
          <li key={item.id}>
            <Card padding="md" className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.order + 1}. {item.title}
                </label>
                <span className="text-caption text-[var(--text-secondary)]">
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <p className="text-caption text-[var(--text-secondary)]">
                {item.outputFormat} {item.fileName ? `・ ${item.fileName}` : ""}
                {item.edited ? " ・ 修正あり" : ""}
              </p>
              {item.error ? (
                <p className="text-sm text-[var(--error)]">{item.error}</p>
              ) : null}
              {previewId === item.id && item.sourceContent ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-caption">
                  {item.sourceContent}
                </pre>
              ) : null}
              {renameId === item.id ? (
                <div className="flex flex-col gap-2 min-[390px]:flex-row">
                  <Input
                    label="ファイル名"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                  <Button
                    className="min-h-[44px]"
                    onClick={() =>
                      void patchDeliverableBatchItemClient(batchId, item.id, {
                        fileName: renameValue,
                      }).then(() => {
                        setRenameId(null);
                        reload();
                      })
                    }
                  >
                    保存
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {item.outputArtifactId ? (
                  <Link
                    href={`/api/deliverables/${item.outputArtifactId}`}
                    className="inline-flex min-h-[44px] items-center text-sm text-accent"
                  >
                    開く / ダウンロード
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => setPreviewId(previewId === item.id ? null : item.id)}
                >
                  プレビュー
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() =>
                    void patchDeliverableBatchItemClient(batchId, item.id, {
                      status: item.status === "approved" ? "ready" : "approved",
                    }).then(reload)
                  }
                >
                  {item.status === "approved" ? "承認解除" : "承認"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => {
                    setRenameId(item.id);
                    setRenameValue(item.fileName ?? item.title);
                  }}
                >
                  ファイル名
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  disabled={busy}
                  onClick={() => void run("regenerate_selected", { itemIds: [item.id] })}
                >
                  再生成
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  disabled={busy}
                  onClick={() => void run("delete_items", { itemIds: [item.id] })}
                >
                  削除
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
