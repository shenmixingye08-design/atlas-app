"use client";

import { useEffect, useState } from "react";

type MetricsPayload = {
  ok: boolean;
  metrics: {
    useCount: number;
    updateCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    averageImprovementRate: number;
    averageOverlapRatio: number;
    channelCoverage: Record<string, number>;
    missingChannels: string[];
    pass: boolean;
  };
  audit: {
    pass: boolean;
    missing: string[];
    localStorageAsMemorySot: string[];
    channels: Array<{ channel: string; applied: boolean; count: number }>;
  };
  checkedAt: string;
};

export function MemoryApplyDashboard() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/health/memory-apply", {
          cache: "no-store",
        });
        const json = (await res.json()) as MetricsPayload;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  const m = data.metrics;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Memory Apply</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Personal Memory の本番適用状況（利用率・更新・成功率・改善率）
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Memory利用回数" value={String(m.useCount)} />
        <MetricCard label="Memory更新回数" value={String(m.updateCount)} />
        <MetricCard
          label="成功率"
          value={`${(m.successRate * 100).toFixed(1)}%`}
        />
        <MetricCard
          label="平均改善率"
          value={`${(m.averageImprovementRate * 100).toFixed(1)}%`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">経路カバレッジ</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.audit.channels.map((row) => (
            <li
              key={row.channel}
              className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm"
            >
              <span>{row.channel}</span>
              <span
                className={
                  row.applied
                    ? "text-emerald-700"
                    : "text-[var(--text-secondary)]"
                }
              >
                {row.applied ? `適用 ${row.count}` : "未適用"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <p>
          監査:{" "}
          <strong>{data.audit.pass ? "PASS" : "FAIL"}</strong>
          {data.audit.missing.length > 0
            ? ` / 未適用: ${data.audit.missing.join(", ")}`
            : ""}
        </p>
        <p className="text-[var(--text-secondary)]">
          localStorage を Memory SoT として扱わない対象:{" "}
          {data.audit.localStorageAsMemorySot.length} 箇所
        </p>
        <p className="text-[var(--text-secondary)]">
          checkedAt: {data.checkedAt}
        </p>
      </section>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="space-y-1 border-b border-[var(--border)] pb-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
        {props.label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{props.value}</p>
    </div>
  );
}
