"use client";

import { useEffect, useState } from "react";

type Bucket = {
  success: number;
  failure: number;
  retry: number;
  timeout: number;
  durationSumMs?: number;
  durationCount?: number;
};

type WindowMetrics = {
  windowDays: 7 | 30 | 90;
  rates: Record<string, number | null>;
  buckets: Record<string, Bucket>;
  avgDurationMs: Record<string, number | null>;
};

type Snapshot = {
  ok: boolean;
  startedAt: string;
  rates: Record<string, number | null>;
  buckets: Record<string, Bucket>;
  avgDurationMs: Record<string, number | null>;
  recentFailures: Array<{ key: string; message: string; at: string }>;
  recentRetries: Array<{ key: string; at: string }>;
  windows: WindowMetrics[];
  dlq: Array<{
    id: string;
    notificationId: string;
    channel: string;
    status: string;
    lastError: string | null;
    attemptCount: number;
    createdAt: string;
  }>;
  circuits: Record<string, { state: string; failures: number }>;
};

function pct(rate: number | null | undefined): string {
  if (rate == null) return "未計測(0)";
  return `${(rate * 100).toFixed(2)}%`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

const KEY_LABELS: Record<string, string> = {
  deliverable_generate: "成果物生成",
  deliverable_download: "成果物DL",
  export_pdf: "PDF",
  export_word: "Word",
  export_excel: "Excel",
  post_x: "X投稿",
  notification_ack: "通知ACK",
  work_job: "仕事Job",
  retry: "Retry",
  recovery: "Recovery",
  timeout: "Timeout",
};

export function ReliabilitySrePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(7);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/owner/reliability-metrics", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Snapshot;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const window =
    data?.windows?.find((w) => w.windowDays === windowDays) ?? null;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-stone-500">SRE</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          Reliability Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-stone-600">
          成功率・失敗・Retry・Timeout・DLQ・Circuit Breaker。未計測は 0
          扱いです。
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-700">読み込み失敗: {error}</p>
      ) : null}

      <div className="flex gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setWindowDays(d)}
            className={
              windowDays === d
                ? "border border-stone-900 bg-stone-900 px-3 py-1.5 text-sm text-white"
                : "border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800"
            }
          >
            {d}日
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="py-2 pr-4 font-medium">指標</th>
              <th className="py-2 pr-4 font-medium">成功率</th>
              <th className="py-2 pr-4 font-medium">失敗率</th>
              <th className="py-2 pr-4 font-medium">Retry率</th>
              <th className="py-2 pr-4 font-medium">Timeout率</th>
              <th className="py-2 pr-4 font-medium">平均処理時間</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(KEY_LABELS).map((key) => {
              const b = window?.buckets?.[key] ?? data?.buckets?.[key];
              const success = b?.success ?? 0;
              const failure = b?.failure ?? 0;
              const retry = b?.retry ?? 0;
              const timeout = b?.timeout ?? 0;
              const total = success + failure;
              const attempts = total + retry + timeout;
              const rate =
                window?.rates?.[key] ?? data?.rates?.[key] ?? null;
              const avg =
                window?.avgDurationMs?.[key] ??
                data?.avgDurationMs?.[key] ??
                null;
              return (
                <tr key={key} className="border-b border-stone-100">
                  <td className="py-2 pr-4 text-stone-900">
                    {KEY_LABELS[key] ?? key}
                  </td>
                  <td className="py-2 pr-4">{pct(rate)}</td>
                  <td className="py-2 pr-4">
                    {total === 0 ? "未計測(0)" : pct(failure / total)}
                  </td>
                  <td className="py-2 pr-4">
                    {attempts === 0 ? "未計測(0)" : pct(retry / attempts)}
                  </td>
                  <td className="py-2 pr-4">
                    {attempts === 0 ? "未計測(0)" : pct(timeout / attempts)}
                  </td>
                  <td className="py-2 pr-4">{fmtMs(avg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">障害 / 失敗一覧</h2>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm text-stone-700">
            {(data?.recentFailures ?? []).length === 0 ? (
              <li>失敗イベントなし（または未計測）</li>
            ) : (
              data?.recentFailures.map((f, i) => (
                <li key={`${f.at}-${i}`} className="border-b border-stone-100 pb-2">
                  <span className="text-stone-500">{f.at}</span> · {f.key}:{" "}
                  {f.message}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">Retry履歴</h2>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm text-stone-700">
            {(data?.recentRetries ?? []).length === 0 ? (
              <li>Retryなし（または未計測）</li>
            ) : (
              data?.recentRetries.map((r, i) => (
                <li key={`${r.at}-${i}`} className="border-b border-stone-100 pb-2">
                  <span className="text-stone-500">{r.at}</span> · {r.key}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">Dead Letter Queue</h2>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm text-stone-700">
          {(data?.dlq ?? []).length === 0 ? (
            <li>DLQ空</li>
          ) : (
            data?.dlq.map((d) => (
              <li key={d.id} className="border-b border-stone-100 pb-2">
                [{d.status}] {d.channel} · attempts={d.attemptCount} ·{" "}
                {d.lastError ?? "—"} · {d.createdAt}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">Circuit Breakers</h2>
        <ul className="grid gap-2 sm:grid-cols-3 text-sm">
          {Object.entries(data?.circuits ?? {}).map(([name, c]) => (
            <li
              key={name}
              className="border border-stone-200 px-3 py-2 text-stone-800"
            >
              <div className="font-medium">{name}</div>
              <div>
                {c.state} · failures={c.failures}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
