"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type SchedulerPayload = {
  health: {
    schedulerAlive: boolean;
    schedulerStopped: boolean;
    queueSize: number;
    runningJobs: number;
    waitingJobs: number;
    failedJobs: number;
    averageDelayMs: number | null;
    successRate: number | null;
    retryCount: number;
    level: "ok" | "warn" | "down";
    detail: string;
  };
  metrics: {
    total: number;
    successes: number;
    failures: number;
    successRate: number | null;
    averageDelayMs: number | null;
    maxDelayMs: number | null;
    p95DelayMs: number | null;
    retryCount: number;
    byFailureReason: Record<string, number>;
  };
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    message: string;
  }>;
  history: Array<{
    id: string;
    jobId: string;
    runId: string;
    scheduleId: string;
    scheduledAt: string;
    startedAt: string;
    endedAt: string;
    delayMs: number;
    success: boolean;
    failureReason: string | null;
    retryCount: number;
    workerId: string;
    durationMs: number;
  }>;
  proof: {
    runs: number;
    successes: number;
    failures: number;
    successRate: number;
    averageDelayMs: number;
    maxDelayMs: number;
  };
};

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} ms`;
}

export function SchedulerDashboardPanel() {
  const [data, setData] = useState<SchedulerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/owner/scheduler?limit=100", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Scheduler情報の取得に失敗しました");
        }
        setData((await response.json()) as SchedulerPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "データなし"} />;

  const { health, metrics, alerts, history, proof } = data;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="space-y-1 p-4">
          <p className="text-caption text-[var(--text-secondary)]">Health</p>
          <p className="text-title text-foreground">{health.level.toUpperCase()}</p>
          <p className="text-body text-[var(--text-secondary)]">{health.detail}</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-caption text-[var(--text-secondary)]">Alive</p>
          <p className="text-title text-foreground">
            {health.schedulerAlive ? "YES" : "NO"}
          </p>
          <p className="text-body text-[var(--text-secondary)]">
            Success {pct(health.successRate)}
          </p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-caption text-[var(--text-secondary)]">Queue</p>
          <p className="text-title text-foreground">{health.queueSize}</p>
          <p className="text-body text-[var(--text-secondary)]">
            running {health.runningJobs} / waiting {health.waitingJobs} / failed{" "}
            {health.failedJobs}
          </p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-caption text-[var(--text-secondary)]">Delay</p>
          <p className="text-title text-foreground">{ms(health.averageDelayMs)}</p>
          <p className="text-body text-[var(--text-secondary)]">
            retry {health.retryCount}
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-title text-foreground">Scheduler Metrics</h2>
        <Card className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <p className="text-caption text-[var(--text-secondary)]">Total</p>
            <p className="text-body text-foreground">{metrics.total}</p>
          </div>
          <div>
            <p className="text-caption text-[var(--text-secondary)]">Success rate</p>
            <p className="text-body text-foreground">{pct(metrics.successRate)}</p>
          </div>
          <div>
            <p className="text-caption text-[var(--text-secondary)]">Max delay</p>
            <p className="text-body text-foreground">{ms(metrics.maxDelayMs)}</p>
          </div>
          <div>
            <p className="text-caption text-[var(--text-secondary)]">p95 delay</p>
            <p className="text-body text-foreground">{ms(metrics.p95DelayMs)}</p>
          </div>
          <div>
            <p className="text-caption text-[var(--text-secondary)]">Failures</p>
            <p className="text-body text-foreground">{metrics.failures}</p>
          </div>
          <div>
            <p className="text-caption text-[var(--text-secondary)]">Proof (last N)</p>
            <p className="text-body text-foreground">
              {proof.runs} runs / {pct(proof.successRate)} / avg{" "}
              {ms(proof.averageDelayMs)}
            </p>
          </div>
        </Card>
      </section>

      {alerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title text-foreground">Alerts</h2>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Card className="space-y-1 p-4">
                  <p className="text-body text-foreground">
                    [{alert.severity}] {alert.title}
                  </p>
                  <p className="text-caption text-[var(--text-secondary)]">
                    {alert.message}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-title text-foreground">Scheduler History</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="px-2 py-2">JobID</th>
                <th className="px-2 py-2">ScheduleID</th>
                <th className="px-2 py-2">予定</th>
                <th className="px-2 py-2">開始</th>
                <th className="px-2 py-2">遅延</th>
                <th className="px-2 py-2">成功</th>
                <th className="px-2 py-2">理由</th>
                <th className="px-2 py-2">Retry</th>
                <th className="px-2 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 100).map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)] text-foreground"
                >
                  <td className="px-2 py-2 font-mono text-xs">{row.jobId.slice(0, 8)}</td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {row.scheduleId.slice(0, 24)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.scheduledAt}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.startedAt}</td>
                  <td className="px-2 py-2">{row.delayMs}</td>
                  <td className="px-2 py-2">{row.success ? "OK" : "NG"}</td>
                  <td className="px-2 py-2">{row.failureReason ?? "—"}</td>
                  <td className="px-2 py-2">{row.retryCount}</td>
                  <td className="px-2 py-2">{row.durationMs}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-2 py-6 text-[var(--text-secondary)]"
                  >
                    まだ Scheduler 実行証跡がありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
