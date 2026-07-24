"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatNextRunDisplay } from "@/lib/automations/form-utils";

type CronDebug = {
  lastTickAt: string | null;
  lastTickOk: boolean | null;
  lastTickError: string | null;
  dueCount: number;
  successCount: number;
  failureCount: number;
};

type LogRow = {
  id: string;
  automationId: string;
  scheduledAt: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  generatedText: string | null;
  xPostId: string | null;
  xPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  xApiSummary: string | null;
};

export function AutomationExecutionLogPanel() {
  const [cron, setCron] = useState<CronDebug | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickBusy, setTickBusy] = useState(false);
  const [tickMessage, setTickMessage] = useState<string | null>(null);

  async function loadLogs() {
    const response = await fetch("/api/owner/automation-execution-logs", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("実行ログの取得に失敗しました");
    }
    const body = (await response.json()) as {
      cron: CronDebug;
      logs: LogRow[];
    };
    setCron(body.cron);
    setLogs(body.logs);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadLogs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function runManualTick() {
    setTickBusy(true);
    setTickMessage(null);
    try {
      const response = await fetch("/api/automations/tick", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        skipped?: boolean;
        reason?: string;
        processed?: number;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "手動 tick に失敗しました");
      }
      if (body.skipped) {
        setTickMessage(`スキップ: ${body.reason ?? "ENABLE_SCHEDULED_CRON=false"}`);
      } else {
        setTickMessage(`手動 tick 完了（処理 ${body.processed ?? 0} 件）`);
      }
      await loadLogs();
    } catch (err) {
      setTickMessage(err instanceof Error ? err.message : "手動 tick に失敗しました");
    } finally {
      setTickBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-title text-foreground">Cron / スケジューラ</h2>
          <button
            type="button"
            onClick={() => void runManualTick()}
            disabled={tickBusy}
            className="min-h-11 rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"
          >
            {tickBusy ? "実行中…" : "予定実行を手動シミュレーション"}
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Hobby では毎日1回 Cron です。毎分実行は Pro 移行後に有効化してください。Owner
          認証付き手動 tick で予定実行ロジックを検証できます。
        </p>
        {tickMessage ? (
          <p className="text-sm text-foreground" role="status">
            {tickMessage}
          </p>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">Cron最終起動日時</dt>
            <dd>{formatNextRunDisplay(cron?.lastTickAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">最終結果</dt>
            <dd>
              {cron?.lastTickOk == null
                ? "—"
                : cron.lastTickOk
                  ? "成功"
                  : `失敗（${cron.lastTickError ?? "不明"}）`}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">実行対象件数</dt>
            <dd>{cron?.dueCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">投稿成功件数</dt>
            <dd>{cron?.successCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">投稿失敗件数</dt>
            <dd>{cron?.failureCount ?? 0}</dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg" className="space-y-4">
        <h2 className="text-title text-foreground">定期仕事 実行ログ</h2>
        <ul className="space-y-3">
          {logs.length === 0 ? (
            <li className="text-sm text-[var(--text-muted)]">ログはまだありません</li>
          ) : (
            logs.map((row) => (
              <li
                key={row.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3 text-sm"
              >
                <p className="font-medium text-foreground">
                  定期仕事ID: {row.automationId}
                </p>
                <p>状態: {row.status}</p>
                <p>次回/予定: {formatNextRunDisplay(row.scheduledAt)}</p>
                <p>開始: {formatNextRunDisplay(row.startedAt)}</p>
                <p>終了: {formatNextRunDisplay(row.completedAt)}</p>
                <p>再試行回数: {row.retryCount}</p>
                {row.xPostId ? <p>投稿ID: {row.xPostId}</p> : null}
                {row.xPostUrl ? (
                  <p>
                    投稿URL:{" "}
                    <a
                      href={row.xPostUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {row.xPostUrl}
                    </a>
                  </p>
                ) : null}
                {row.errorCode ? <p>エラーコード: {row.errorCode}</p> : null}
                {row.errorMessage ? <p>エラー: {row.errorMessage}</p> : null}
                {row.xApiSummary ? <p>X API要約: {row.xApiSummary}</p> : null}
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
