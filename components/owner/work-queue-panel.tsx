"use client";

import { useEffect, useState, type ReactNode } from "react";

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
  p50ScheduleDelayMs?: number | null;
  p90ScheduleDelayMs?: number | null;
  p95ScheduleDelayMs: number | null;
  p99ScheduleDelayMs: number | null;
  averageDelayMs: number | null;
  p95ExecutionMs: number | null;
  recoverySuccessRate: number | null;
  recoveryCount?: number | null;
  alive: boolean;
  workerCount: number;
  successRate: number | null;
  failureRate: number | null;
  averageQueueWaitMs: number | null;
  workerBusyPercent: number | null;
};

type OpsHealth = {
  running: boolean;
  healthy: boolean;
  status: string;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  dueCount: number | null;
  queueCount: number | null;
  oldestDueAgeMs: number | null;
  p95DelayMs: number | null;
  retryCount: number | null;
  recoverySuccessRate: number | null;
  outboxPendingCount: number | null;
  workerCount: number | null;
};

type OpsMetrics = {
  tickCount: number | null;
  runCount: number | null;
  occurrenceCount: number | null;
  queueCount: number;
  missCount: number | null;
  duplicateCount: number;
  retryCount: number;
  recoveryCount: number | null;
  p50DelayMs: number | null;
  p90DelayMs: number | null;
  p95DelayMs: number | null;
  p99DelayMs: number | null;
};

type OpsSnapshot = {
  health: OpsHealth;
  metrics: OpsMetrics;
  alerts: Array<{ code: string; severity: string; message: string }>;
  killSwitches: {
    scheduledCronEnabled: boolean;
    dispatcherDisabled: boolean;
    queueDisabled: boolean;
    previewTickAllowed: boolean;
    schedulerSecretConfigured: boolean;
  };
};

type Snapshot = {
  metrics: MetricsResponse;
  ops?: OpsSnapshot | null;
  health?: OpsHealth | null;
  bridge?: Record<string, unknown> | null;
  alerts: Array<{ code: string; severity: string; message: string }>;
  capabilities: Array<{
    capability: string;
    status: string;
    note: string;
  }>;
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

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value)}ms`;
}

function age(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value / 1000)}s`;
}

/** Owner-only operational view — Phase 2-5 Cutover dashboard. */
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
  const ops = data.ops;
  const health = ops?.health ?? data.health;
  const opsMetrics = ops?.metrics;
  const alerts = ops?.alerts?.length ? ops.alerts : data.alerts;
  const flags = ops?.killSwitches;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Scheduler · Queue · Worker · Automation · Health
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Phase 2-5 Production Cutover — 実DB/Metrics由来（固定値禁止）
        </p>
      </div>

      <Section title="Health">
        <Metric
          label="Running"
          value={health?.running ? "YES" : "NO"}
          tone={health?.running ? "ok" : "bad"}
        />
        <Metric
          label="Healthy"
          value={health?.healthy ? "YES" : "NO"}
          tone={health?.healthy ? "ok" : "bad"}
        />
        <Metric label="Last Tick" value={health?.lastTickAt ?? "—"} />
        <Metric
          label="Last Success"
          value={health?.lastSuccessAt ?? metrics.schedulerLastSuccessAt ?? "—"}
        />
        <Metric label="Last Failure" value={health?.lastFailureAt ?? "—"} />
        <Metric label="Due Count" value={health?.dueCount ?? "—"} />
        <Metric
          label="Queue Count"
          value={health?.queueCount ?? metrics.queued}
        />
        <Metric label="Oldest Due" value={age(health?.oldestDueAgeMs)} />
        <Metric
          label="P95 Delay"
          value={ms(health?.p95DelayMs ?? metrics.p95ScheduleDelayMs)}
        />
        <Metric
          label="Retry"
          value={health?.retryCount ?? metrics.retryScheduled}
        />
        <Metric
          label="Recovery"
          value={pct(health?.recoverySuccessRate ?? metrics.recoverySuccessRate)}
        />
        <Metric
          label="Status"
          value={(health?.status ?? "—").toString().toUpperCase()}
          tone={health?.status === "ok" ? "ok" : "bad"}
        />
      </Section>

      <Section title="Metrics">
        <Metric label="Tick Count" value={opsMetrics?.tickCount ?? "—"} />
        <Metric label="Run Count" value={opsMetrics?.runCount ?? "—"} />
        <Metric
          label="Occurrence Count"
          value={opsMetrics?.occurrenceCount ?? "—"}
        />
        <Metric
          label="Queue Count"
          value={opsMetrics?.queueCount ?? metrics.queued}
        />
        <Metric label="Miss Count" value={opsMetrics?.missCount ?? "—"} />
        <Metric
          label="Duplicate Count"
          value={opsMetrics?.duplicateCount ?? metrics.duplicateCount}
        />
        <Metric
          label="Retry Count"
          value={opsMetrics?.retryCount ?? metrics.retryScheduled}
        />
        <Metric
          label="Recovery Count"
          value={opsMetrics?.recoveryCount ?? metrics.recoveryCount ?? "—"}
        />
        <Metric
          label="P50"
          value={ms(opsMetrics?.p50DelayMs ?? metrics.p50ScheduleDelayMs)}
        />
        <Metric
          label="P90"
          value={ms(opsMetrics?.p90DelayMs ?? metrics.p90ScheduleDelayMs)}
        />
        <Metric
          label="P95"
          value={ms(opsMetrics?.p95DelayMs ?? metrics.p95ScheduleDelayMs)}
        />
        <Metric
          label="P99"
          value={ms(opsMetrics?.p99DelayMs ?? metrics.p99ScheduleDelayMs)}
        />
      </Section>

      <Section title="Scheduler">
        <Metric
          label="Scheduler Alive"
          value={metrics.alive ? "YES" : "NO"}
          tone={metrics.alive ? "ok" : "bad"}
        />
        <Metric
          label="Cron Enabled"
          value={flags?.scheduledCronEnabled ? "YES" : "NO"}
          tone={flags?.scheduledCronEnabled ? "ok" : "bad"}
        />
        <Metric
          label="Secret Configured"
          value={flags?.schedulerSecretConfigured ? "YES" : "NO"}
          tone={flags?.schedulerSecretConfigured ? "ok" : "bad"}
        />
        <Metric
          label="Dispatcher Disabled"
          value={flags?.dispatcherDisabled ? "YES" : "NO"}
          tone={flags?.dispatcherDisabled ? "bad" : "ok"}
        />
      </Section>

      <Section title="Queue">
        <Metric label="Waiting" value={metrics.waiting ?? metrics.queued} />
        <Metric label="Oldest Job" value={age(metrics.oldestQueuedAgeMs)} />
        <Metric label="Dead Letter" value={metrics.deadLetter} />
        <Metric
          label="Queue Disabled"
          value={flags?.queueDisabled ? "YES" : "NO"}
          tone={flags?.queueDisabled ? "bad" : "ok"}
        />
      </Section>

      <Section title="Worker">
        <Metric label="Worker Count" value={metrics.workerCount} />
        <Metric label="Leased" value={metrics.leased} />
        <Metric label="Running" value={metrics.running} />
        <Metric label="Stuck" value={metrics.stuck} />
        <Metric
          label="Worker Busy"
          value={
            metrics.workerBusyPercent == null
              ? "—"
              : `${metrics.workerBusyPercent}%`
          }
        />
        <Metric label="Success Rate" value={pct(metrics.successRate)} />
        <Metric label="Failed" value={metrics.failed} />
        <Metric label="Completed" value={metrics.completed} />
      </Section>

      <Section title="Automation">
        <Metric label="Due Count" value={health?.dueCount ?? "—"} />
        <Metric
          label="Outbox Pending"
          value={health?.outboxPendingCount ?? "—"}
        />
        <Metric
          label="Preview Tick Allowed"
          value={flags?.previewTickAllowed ? "YES" : "NO"}
        />
        <Metric label="Avg Delay" value={ms(metrics.averageDelayMs)} />
      </Section>

      {alerts.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-semibold">Alerts</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((alert, idx) => (
              <li key={`${alert.code}-${idx}`}>
                <span className="font-medium">{alert.code}</span> (
                {alert.severity}) — {alert.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Alerts: none</p>
      )}

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
    </div>
  );
}
