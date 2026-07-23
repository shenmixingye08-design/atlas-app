"use client";

import { useCallback, useEffect, useState } from "react";

import type { AutomationExecutionLogSnapshot } from "@/lib/automations/execution-log/types";
import { formatDurationMs } from "@/lib/automations/execution-status";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

async function fetchSnapshot(): Promise<AutomationExecutionLogSnapshot> {
  const response = await fetch("/api/owner/automation-execution-logs?limit=100", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("繰り返し仕事ログの取得に失敗しました");
  }
  return (await response.json()) as AutomationExecutionLogSnapshot;
}

function eventLabel(event: string): string {
  switch (event) {
    case "started":
      return "開始";
    case "retry_scheduled":
      return "リトライ予約";
    case "completed":
      return "成功";
    case "failed":
      return "失敗";
    default:
      return event;
  }
}

export function AutomationExecutionLogPanel() {
  const [snapshot, setSnapshot] = useState<AutomationExecutionLogSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSnapshot();
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snapshot) return <LoadingState />;
  if (error && !snapshot) return <ErrorState message={error} />;
  if (!snapshot) return null;

  const successPercent = Math.round(snapshot.totals.successRate * 100);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title text-foreground">繰り返し仕事の実行ログ</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            ジョブ起動・AI実行・X API呼び出し・停止箇所を確認できます。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          再読み込み
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="md" className="border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">総実行</p>
          <p className="mt-2 text-2xl font-semibold">{snapshot.totals.runs}</p>
        </Card>
        <Card padding="md" className="border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">成功率</p>
          <p className="mt-2 text-2xl font-semibold">{successPercent}%</p>
        </Card>
        <Card padding="md" className="border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">完了 / 失敗</p>
          <p className="mt-2 text-2xl font-semibold">
            {snapshot.totals.completed} / {snapshot.totals.failed}
          </p>
        </Card>
        <Card padding="md" className="border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">平均実行時間</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatDurationMs(snapshot.totals.averageDurationMs)}
          </p>
        </Card>
      </section>

      {error && <ErrorState message={error} />}

      <section className="space-y-3">
        {snapshot.entries.length === 0 ? (
          <Card padding="lg" className="border border-dashed border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-muted)]">
              まだ実行ログはありません。スケジュール時刻または手動実行後に記録されます。
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {snapshot.entries.map((entry) => (
              <li key={entry.id}>
                <Card
                  padding="md"
                  className="border border-[var(--border-subtle)] bg-[var(--card)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {entry.automationName}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {eventLabel(entry.event)} · {entry.startedAt}
                        {entry.completedAt ? ` → ${entry.completedAt}` : ""} ·{" "}
                        {formatDurationMs(entry.durationMs)} · 試行
                        {entry.attempt}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {entry.status === "completed"
                        ? "成功"
                        : entry.status === "retrying"
                          ? "リトライ中"
                          : entry.status === "running"
                            ? "実行中"
                            : "失敗"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    ジョブ起動: はい / AI実行: {entry.aiRan ? "はい" : "いいえ"} /
                    X API: {entry.xApiCalled ? "はい" : "いいえ"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    停止箇所: {entry.stoppedAtStage ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    実施内容:{" "}
                    {entry.actions.length > 0
                      ? entry.actions.join(" → ")
                      : "—"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    API:{" "}
                    {entry.apisUsed.length > 0
                      ? entry.apisUsed.join(", ")
                      : "—"}
                  </p>
                  {entry.generatedContent && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      生成内容: {entry.generatedContent.slice(0, 280)}
                      {entry.generatedContent.length > 280 ? "…" : ""}
                    </p>
                  )}
                  {(entry.tweetUrl || entry.artifactUrls.length > 0) && (
                    <p className="mt-1 break-all text-sm text-accent">
                      {entry.tweetUrl ?? entry.artifactUrls.join(" · ")}
                    </p>
                  )}
                  {entry.nextRetryAt && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      次回リトライ: {entry.nextRetryAt}
                    </p>
                  )}
                  {entry.error && (
                    <p className="mt-2 text-sm text-[var(--status-error)]">
                      {entry.error}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
