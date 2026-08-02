"use client";

import { useCallback, useEffect, useState } from "react";

type Metrics = {
  at: string;
  queueLength: number;
  runningCount: number;
  activeLeaseCount: number;
  retryCount: number;
  failureRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  p99DurationMs: number | null;
  p95ScheduleDelayMs: number | null;
  p99ScheduleDelayMs: number | null;
  recoverySuccessRate: number | null;
  duplicateRate: number | null;
  failuresByClass: Record<string, number>;
  scheduler: {
    lastTickAt: string | null;
    lastOk: boolean | null;
    stale: boolean;
    tickCount: number;
  };
  worker: {
    lastActivityAt: string | null;
    stale: boolean;
  };
  dueAutomationCount: number;
};

type Alert = {
  kind: string;
  severity: string;
  message: string;
  at: string;
};

type EventRow = {
  id: string;
  at: string;
  runId: string;
  automationId: string;
  step: string;
  status: string;
  retryCount: number;
  failureClass: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={
        warn
          ? "rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--error-bg)] p-4"
          : "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
      }
    >
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function formatMs(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function SchedulerReliabilityDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/owner/scheduler-reliability", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        metrics: Metrics;
        alerts: Alert[];
        events: EventRow[];
      };
      setMetrics(data.metrics);
      setAlerts(data.alerts);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込み失敗");
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(id);
    };
  }, [load]);

  const runTick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/tick", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `tick HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "tick失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="scheduler-reliability-dashboard">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium"
        >
          再読込
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runTick()}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
        >
          {busy ? "Tick実行中…" : "今すぐ Tick"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}

      {metrics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Queue長" value={String(metrics.queueLength)} />
            <Stat label="Running数" value={String(metrics.runningCount)} />
            <Stat label="Retry数" value={String(metrics.retryCount)} />
            <Stat
              label="Failure率"
              value={`${Math.round(metrics.failureRate * 100)}%`}
              warn={metrics.failureRate >= 0.25}
            />
            <Stat label="平均実行時間" value={formatMs(metrics.avgDurationMs)} />
            <Stat label="P95" value={formatMs(metrics.p95DurationMs)} />
            <Stat label="P99" value={formatMs(metrics.p99DurationMs)} />
            <Stat
              label="予定遅延 P95"
              value={formatMs(metrics.p95ScheduleDelayMs)}
              warn={
                metrics.p95ScheduleDelayMs != null &&
                metrics.p95ScheduleDelayMs > 60_000
              }
            />
            <Stat
              label="Recovery成功率"
              value={
                metrics.recoverySuccessRate == null
                  ? "—"
                  : `${Math.round(metrics.recoverySuccessRate * 100)}%`
              }
            />
            <Stat
              label="Duplicate率"
              value={
                metrics.duplicateRate == null
                  ? "—"
                  : `${Math.round(metrics.duplicateRate * 100)}%`
              }
            />
            <Stat
              label="Scheduler"
              value={metrics.scheduler.stale ? "STALE" : "OK"}
              warn={metrics.scheduler.stale}
            />
            <Stat
              label="Worker"
              value={metrics.worker.stale ? "STALE" : "OK"}
              warn={metrics.worker.stale}
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Alerts</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">アラートなし</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={`${alert.kind}-${alert.at}`}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm"
                  >
                    <span className="font-semibold uppercase">
                      {alert.severity}
                    </span>{" "}
                    {alert.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Failure classes</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(metrics.failuresByClass).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
                >
                  {key}: {value}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Execution log</h2>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">時刻</th>
                    <th className="px-3 py-2">step</th>
                    <th className="px-3 py-2">status</th>
                    <th className="px-3 py-2">retry</th>
                    <th className="px-3 py-2">class</th>
                    <th className="px-3 py-2">runId</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(event.at).toLocaleString("ja-JP")}
                      </td>
                      <td className="px-3 py-2">{event.step}</td>
                      <td className="px-3 py-2">{event.status}</td>
                      <td className="px-3 py-2">{event.retryCount}</td>
                      <td className="px-3 py-2">{event.failureClass ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {event.runId.slice(0, 12)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">読み込み中…</p>
      )}
    </div>
  );
}
