"use client";

import { useEffect, useState } from "react";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type MetricsResponse = {
  queued: number;
  waiting: number;
  leased: number;
  running: number;
  retryScheduled: number;
  stuck: number;
  failed: number;
  deadLetter: number;
  completed: number;
  oldestQueuedAgeMs: number | null;
  duplicateCount: number;
  schedulerLastSuccessAt: string | null;
  p95ScheduleDelayMs: number | null;
  p99ScheduleDelayMs: number | null;
  averageDelayMs: number | null;
  p95ExecutionMs: number | null;
  recoverySuccessRate: number | null;
  alive: boolean;
  workerCount: number;
  successRate: number | null;
  failureRate: number | null;
  averageQueueWaitMs: number | null;
  workerBusyPercent: number | null;
};

type Snapshot = {
  metrics: MetricsResponse;
  alerts: Array<{ code: string; severity: string; message: string }>;
  capabilities: Array<{
    capability: string;
    status: string;
    note: string;
  }>;
  cronSot?: {
    infrastructure: Array<{
      id: string;
      schedule: string;
      path: string;
      providers: string[];
      purpose: string;
    }>;
    productPresets: string[];
  };
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value)}ms`;
}

/** Owner-only operational view — internal queue terms OK here. */
export function WorkQueuePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return scheduleMountWork(() => {
      void fetch("/api/owner/work-queue/metrics")
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as Snapshot | MetricsResponse;
        })
        .then((body) => {
          if ("metrics" in body) setData(body as Snapshot);
          else
            setData({
              metrics: body as MetricsResponse,
              alerts: [],
              capabilities: [],
            });
        })
        .catch((err: Error) => setError(err.message));
    });
  }, []);

  if (error) {
    return <p className="text-sm text-red-700">指標の取得に失敗: {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  const metrics = data.metrics;
  const ageSec =
    metrics.oldestQueuedAgeMs == null
      ? "—"
      : `${Math.round(metrics.oldestQueuedAgeMs / 1000)}s`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Scheduler · Queue · Worker
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Alive / Queue / Lease / Retry / Metrics / Alerts（一般ユーザー非表示）
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Scheduler Alive"
          value={metrics.alive ? "YES" : "NO"}
          tone={metrics.alive ? "ok" : "bad"}
        />
        <Metric label="Queue Size" value={metrics.waiting ?? metrics.queued} />
        <Metric label="Worker Count" value={metrics.workerCount} />
        <Metric
          label="Success Rate"
          value={pct(metrics.successRate)}
          tone={
            metrics.successRate == null
              ? undefined
              : metrics.successRate >= 0.95
                ? "ok"
                : "bad"
          }
        />
        <Metric label="Running" value={metrics.running} />
        <Metric label="Waiting" value={metrics.waiting ?? metrics.queued} />
        <Metric label="Retry" value={metrics.retryScheduled} />
        <Metric label="Failed" value={metrics.failed} />
        <Metric label="leased" value={metrics.leased} />
        <Metric label="stuck" value={metrics.stuck} />
        <Metric label="dead-letter" value={metrics.deadLetter} />
        <Metric label="completed" value={metrics.completed} />
        <Metric label="Avg Delay" value={ms(metrics.averageDelayMs)} />
        <Metric label="P95 Delay" value={ms(metrics.p95ScheduleDelayMs)} />
        <Metric label="P99 Delay" value={ms(metrics.p99ScheduleDelayMs)} />
        <Metric label="Queue Wait" value={ms(metrics.averageQueueWaitMs)} />
        <Metric
          label="Worker Busy"
          value={
            metrics.workerBusyPercent == null
              ? "—"
              : `${metrics.workerBusyPercent}%`
          }
        />
        <Metric label="oldest queued age" value={ageSec} />
        <Metric label="duplicate count" value={metrics.duplicateCount} />
        <Metric
          label="recovery success rate"
          value={
            metrics.recoverySuccessRate == null
              ? "—"
              : `${Math.round(metrics.recoverySuccessRate * 100)}%`
          }
        />
        <Metric
          label="Scheduler最終成功"
          value={metrics.schedulerLastSuccessAt ?? "—"}
        />
      </div>

      {data.alerts.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-semibold">Alerts</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.alerts.map((alert, idx) => (
              <li key={`${alert.code}-${idx}`}>
                <span className="font-medium">{alert.code}</span> — {alert.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.capabilities.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-semibold">Schedule Capabilities</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.capabilities.map((cap) => (
              <li key={cap.capability}>
                <span className="font-medium">{cap.capability}</span>{" "}
                <span>({cap.status})</span> — {cap.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.cronSot ? (
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-semibold">Cron SoT</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Product presets: {data.cronSot.productPresets.join(" · ")}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.cronSot.infrastructure.map((entry) => (
              <li key={entry.id}>
                <span className="font-mono text-xs">{entry.schedule}</span>{" "}
                → {entry.path}{" "}
                <span className="text-[var(--text-secondary)]">
                  ({entry.providers.join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
