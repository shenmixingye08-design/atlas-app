"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";

type VisionMetricsPayload = {
  ok: boolean;
  days: number;
  metrics: {
    totalAttempts: number;
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    temporaryErrorCount: number;
    analysisFailureCount: number;
    successRate: number | null;
    averageResponseMs: number | null;
    averageSuccessResponseMs: number | null;
    rateLimitCount: number;
    networkCount: number;
    windowStartedAt: string | null;
    windowEndedAt: string | null;
  };
  note: string;
};

function fmtRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms).toLocaleString("ja-JP")} ms`;
}

async function fetchMetrics(days: number): Promise<VisionMetricsPayload> {
  const response = await fetch(`/api/owner/diagnostics/vision?days=${days}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load vision diagnostics");
  }
  return response.json() as Promise<VisionMetricsPayload>;
}

export function VisionDiagnosticsPanel() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<VisionMetricsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMetrics(windowDays);
      setData(payload);
    } catch {
      setError("Vision診断メトリクスを取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Vision解析診断
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            OpenAI側の一時障害（timeout）と画像解析失敗を区別して監視します。
          </p>
        </div>
        <label className="text-sm text-[var(--text-secondary)]">
          期間{" "}
          <select
            className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-foreground"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={1}>1日</option>
            <option value={7}>7日</option>
            <option value={30}>30日</option>
          </select>
        </label>
      </div>

      {loading && (
        <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {metrics && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="space-y-1 p-4">
              <p className="text-xs text-[var(--text-secondary)]">timeout件数</p>
              <p className="text-2xl font-semibold text-foreground">
                {metrics.timeoutCount.toLocaleString("ja-JP")}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                一時エラー（解析失敗ではない）
              </p>
            </Card>
            <Card className="space-y-1 p-4">
              <p className="text-xs text-[var(--text-secondary)]">平均応答時間</p>
              <p className="text-2xl font-semibold text-foreground">
                {fmtMs(metrics.averageResponseMs)}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                成功時平均: {fmtMs(metrics.averageSuccessResponseMs)}
              </p>
            </Card>
            <Card className="space-y-1 p-4">
              <p className="text-xs text-[var(--text-secondary)]">成功率</p>
              <p className="text-2xl font-semibold text-foreground">
                {fmtRate(metrics.successRate)}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {metrics.successCount.toLocaleString("ja-JP")} /{" "}
                {metrics.totalAttempts.toLocaleString("ja-JP")} 件
              </p>
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium text-foreground">内訳</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-secondary)]">一時エラー合計</dt>
                <dd>{metrics.temporaryErrorCount.toLocaleString("ja-JP")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-secondary)]">解析失敗</dt>
                <dd>{metrics.analysisFailureCount.toLocaleString("ja-JP")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-secondary)]">rate_limit</dt>
                <dd>{metrics.rateLimitCount.toLocaleString("ja-JP")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-secondary)]">network</dt>
                <dd>{metrics.networkCount.toLocaleString("ja-JP")}</dd>
              </div>
            </dl>
            {data?.note && (
              <p className="text-xs text-[var(--text-muted)]">{data.note}</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
