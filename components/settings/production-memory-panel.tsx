"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import type {
  ProductionMemoryRecord,
  QualityMetrics,
} from "@/lib/personalization/types";

type Tab = "active" | "candidate" | "rejected" | "disabled" | "deleted";

export function ProductionMemoryPanel() {
  const [memories, setMemories] = useState<ProductionMemoryRecord[]>([]);
  const [recentApplied, setRecentApplied] = useState<ProductionMemoryRecord[]>(
    [],
  );
  const [recentRejected, setRecentRejected] = useState<
    ProductionMemoryRecord[]
  >([]);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const [memRes, previewRes, metricsRes] = await Promise.all([
      fetch("/api/personalization"),
      fetch("/api/personalization?view=preview"),
      fetch("/api/personalization?view=metrics"),
    ]);
    if (!memRes.ok) throw new Error("好みの読み込みに失敗しました");
    const memJson = (await memRes.json()) as {
      memories: ProductionMemoryRecord[];
      recentApplied: ProductionMemoryRecord[];
      recentRejected: ProductionMemoryRecord[];
    };
    setMemories(memJson.memories);
    setRecentApplied(memJson.recentApplied ?? []);
    setRecentRejected(memJson.recentRejected ?? []);
    if (previewRes.ok) {
      const previewJson = (await previewRes.json()) as {
        previewLines: string[];
      };
      setPreviewLines(previewJson.previewLines ?? []);
    }
    if (metricsRes.ok) {
      const metricsJson = (await metricsRes.json()) as {
        metrics: QualityMetrics;
      };
      setMetrics(metricsJson.metrics);
    }
  }, []);

  useEffect(() => {
    return scheduleMountWork(() => {
      void reload().catch((err: Error) => {
        setError(err.message);
      });
    });
  }, [reload]);

  const filtered = useMemo(
    () => memories.filter((m) => m.candidateStatus === tab),
    [memories, tab],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memories.filter((x) => x.candidateStatus === "active")) {
      const key = m.category ?? "全般";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [memories]);

  const act = (action: string, memoryId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/personalization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, memoryId }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "更新に失敗しました");
        }
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新に失敗しました");
      }
    });
  };

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorState message={error} />
        <Button type="button" onClick={() => void reload()}>
          再読み込み
        </Button>
      </div>
    );
  }

  if (memories.length === 0 && pending) {
    return <LoadingState message="覚えていることを読み込んでいます" />;
  }

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          MINERVOTが覚えていること
        </h1>
        <p className="text-sm text-[var(--atlas-muted)]">
          正式な好み・候補・最近の適用結果です。内部スコアは表示しません。
        </p>
      </header>

      {previewLines.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">今回適用する好み</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {previewLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-[var(--atlas-muted)]">
            このまま作成 / 一部変更 / 今回だけ外す — 生成画面から選べます
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-medium">最近覚えたこと</h2>
        <ul className="space-y-1 text-sm">
          {recentApplied.length === 0 ? (
            <li className="text-[var(--atlas-muted)]">まだ適用履歴がありません</li>
          ) : (
            recentApplied.map((m) => (
              <li key={m.memoryId}>
                {m.title} — {m.summary}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">最近断った提案</h2>
        <ul className="space-y-1 text-sm">
          {recentRejected.length === 0 ? (
            <li className="text-[var(--atlas-muted)]">ありません</li>
          ) : (
            recentRejected.map((m) => (
              <li key={m.memoryId}>
                {m.title} — {m.summary}
              </li>
            ))
          )}
        </ul>
      </div>

      {byCategory.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">カテゴリ別</h2>
          <ul className="space-y-1 text-sm">
            {byCategory.map(([name, count]) => (
              <li key={name}>
                {name}: {count}件
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {metrics && metrics.sampleSize > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">修正が減った傾向</h2>
          <p className="text-sm text-[var(--atlas-muted)]">
            実測（推定ではありません）· サンプル {metrics.sampleSize} 件
          </p>
          <ul className="space-y-1 text-sm">
            <li>
              初回採用率: {Math.round(metrics.firstAcceptRate * 100)}%
            </li>
            <li>
              指示量の削減傾向:{" "}
              {Math.round(metrics.instructionReductionRate * 100)}%
            </li>
            <li>
              誤適用率: {Math.round(metrics.falseApplicationRate * 100)}%
            </li>
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["active", "正式な好み"],
            ["candidate", "候補"],
            ["rejected", "却下"],
            ["disabled", "無効"],
            ["deleted", "削除済み"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant={tab === id ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <ul className="space-y-4">
        {filtered.length === 0 ? (
          <li className="text-sm text-[var(--atlas-muted)]">該当なし</li>
        ) : (
          filtered.map((memory) => (
            <li key={memory.memoryId} className="space-y-2 border-b pb-4">
              <div className="font-medium">{memory.title}</div>
              <p className="text-sm text-[var(--atlas-muted)]">{memory.summary}</p>
              <p className="text-xs text-[var(--atlas-muted)]">
                {memory.scopeType}
                {memory.category ? ` / ${memory.category}` : ""}
                {memory.artifactType ? ` / ${memory.artifactType}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {memory.candidateStatus === "candidate" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => act("approve", memory.memoryId)}
                    >
                      正式にする
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => act("reject", memory.memoryId)}
                    >
                      却下
                    </Button>
                  </>
                ) : null}
                {memory.candidateStatus === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => act("disable", memory.memoryId)}
                  >
                    無効化
                  </Button>
                ) : null}
                {memory.candidateStatus !== "deleted" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => act("delete", memory.memoryId)}
                  >
                    削除
                  </Button>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
