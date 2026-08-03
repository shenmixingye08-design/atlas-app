"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type ServiceHealth = {
  service: string;
  mode: string;
  registered: boolean;
  configured: boolean;
  classification: string;
  availability: string;
  successRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  retryRate: number | null;
  rateLimit429Rate: number | null;
  authFailureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  samples: number;
};

type Payload = {
  runtimeMode: string;
  services: ServiceHealth[];
  inventory: Array<{
    service: string;
    classification: string;
    notes: string;
  }>;
};

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function LiveAdaptersPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/owner/live-adapters", { cache: "no-store" });
        if (!res.ok) throw new Error("Live Adapter情報の取得に失敗しました");
        setData((await res.json()) as Payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "取得失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "データなし"} />;

  return (
    <div className="space-y-6">
      <Card className="space-y-1 p-4">
        <p className="text-caption text-[var(--text-secondary)]">Runtime Mode</p>
        <p className="text-title text-foreground">{data.runtimeMode}</p>
        <p className="text-body text-[var(--text-secondary)]">
          Production では sandbox / mock / stub 成功は禁止です。
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-title text-foreground">Registered Live Adapters</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="px-2 py-2">Service</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2">Configured</th>
                <th className="px-2 py-2">Success</th>
                <th className="px-2 py-2">Avg / p95</th>
                <th className="px-2 py-2">Retry</th>
                <th className="px-2 py-2">429</th>
                <th className="px-2 py-2">Auth fails</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((row) => (
                <tr key={row.service} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">{row.service}</td>
                  <td className="px-2 py-2">{row.mode}</td>
                  <td className="px-2 py-2">{row.configured ? "YES" : "NO"}</td>
                  <td className="px-2 py-2">{pct(row.successRate)}</td>
                  <td className="px-2 py-2">
                    {row.averageLatencyMs == null
                      ? "—"
                      : `${Math.round(row.averageLatencyMs)} / ${row.p95LatencyMs == null ? "—" : Math.round(row.p95LatencyMs)} ms`}
                  </td>
                  <td className="px-2 py-2">{pct(row.retryRate)}</td>
                  <td className="px-2 py-2">{pct(row.rateLimit429Rate)}</td>
                  <td className="px-2 py-2">{row.authFailureCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-title text-foreground">Audit Inventory</h2>
        <ul className="space-y-2">
          {data.inventory.map((row) => (
            <li key={row.service}>
              <Card className="space-y-1 p-4">
                <p className="text-body text-foreground">
                  {row.service} — {row.classification}
                </p>
                <p className="text-caption text-[var(--text-secondary)]">
                  {row.notes}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
