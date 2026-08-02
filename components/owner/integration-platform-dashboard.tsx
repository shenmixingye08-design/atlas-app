"use client";

import { useEffect, useState } from "react";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import type { IntegrationServiceMetrics } from "@/lib/integration-platform/types";

type CatalogRow = {
  serviceId: string;
  label: string;
  classification: string;
  notes: string;
};

type DashboardPayload = {
  catalog: CatalogRow[];
  connections: Array<{
    serviceId: string;
    status: string;
    statusMessage: string | null;
    failureCount: number;
  }>;
  metrics: IntegrationServiceMetrics[];
  tokens: Array<{
    serviceId: string;
    expiresAt: string | null;
    failureCount: number;
    hasRefresh: boolean;
    rotationVersion: number;
  }>;
  sandboxMode: boolean;
};

export function IntegrationPlatformDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);

  useEffect(() => {
    return scheduleMountWork(() => {
      void fetch("/api/integrations/platform")
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as DashboardPayload;
        })
        .then(setData)
        .catch((err: Error) => setError(err.message));
    });
  }, []);

  const runBenchmark = () => {
    setBenchmarking(true);
    void fetch("/api/integrations/platform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "benchmark" }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return fetch("/api/integrations/platform").then((r) => r.json());
      })
      .then((json) => setData(json as DashboardPayload))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBenchmarking(false));
  };

  if (error) {
    return <p className="text-sm text-red-700">連携指標の取得に失敗: {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">外部連携（本番品質）</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          接続確認だけでは完了にしません。URL/ID検証・Fail Closed・Retry方針を表示します。
          {data.sandboxMode ? " · sandbox計測モード" : ""}
        </p>
      </header>

      <div>
        <button
          type="button"
          className="text-sm underline"
          disabled={benchmarking}
          onClick={runBenchmark}
        >
          {benchmarking ? "100回計測中…" : "Sandbox 100回計測を実行"}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">接続カタログ</h3>
        <ul className="space-y-1 text-sm">
          {data.catalog.map((row) => (
            <li key={row.serviceId}>
              {row.label}: <code>{row.classification}</code> — {row.notes}
            </li>
          ))}
        </ul>
      </div>

      {data.metrics.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">実測メトリクス</h3>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {data.metrics.map((m) => (
              <li key={m.serviceId} className="space-y-0.5">
                <div className="font-medium">{m.serviceId}</div>
                <div>成功率: {pct(m.successRate)} · n={m.sampleSize}</div>
                <div>
                  avg {m.avgMs}ms · p95 {m.p95Ms}ms · p99 {m.p99Ms}ms
                </div>
                <div>
                  429率 {pct(m.rateLimit429Rate)} · Retry率 {pct(m.retryRate)} ·
                  障害率 {pct(m.failureRate)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">トークン / 接続状態</h3>
        <ul className="space-y-1 text-sm">
          {data.connections.map((c) => (
            <li key={c.serviceId}>
              {c.serviceId}: {c.status}
              {c.statusMessage ? ` — ${c.statusMessage}` : ""}
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-sm">
          {data.tokens.map((t) => (
            <li key={t.serviceId}>
              {t.serviceId}: expires={t.expiresAt ?? "—"} · refresh=
              {t.hasRefresh ? "yes" : "no"} · rot={t.rotationVersion} ·
              failures={t.failureCount}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
