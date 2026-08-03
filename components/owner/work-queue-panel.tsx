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
  averageExecutionMs?: number | null;
  recoverySuccessRate: number | null;
  recoveryCount?: number;
  retryCount?: number;
  timeoutCount?: number;
  notificationCount?: number;
  startedCount?: number;
  queueLength?: number;
  alive: boolean;
  workerCount: number;
  successRate: number | null;
  failureRate: number | null;
  averageQueueWaitMs: number | null;
  workerBusyPercent: number | null;
};

type DurabilitySlice = {
  storeKind: "file" | "postgres";
  worker: {
    workerCount: number;
    workers: Array<{
      workerId: string;
      lastSeenAt: string;
      busy: boolean;
      status: string;
      leaseCount: number;
    }>;
  };
  retry: {
    scheduled: number;
    totalCount: number;
    recent: Array<{ jobId: string; attempt: number; reason: string; at: string }>;
  };
  recovery: {
    totalCount: number;
    successRate: number | null;
    recent: Array<{
      eventId: string;
      jobId: string | null;
      kind: string;
      success: boolean;
      createdAt: string;
    }>;
  };
  lease: {
    leased: number;
    stuck: number;
    active: Array<{
      jobId: string;
      leaseOwner: string | null;
      leaseExpiresAt: string | null;
      status: string;
    }>;
  };
  notification: { count: number };
  memory: { sot: string; note: string };
  locks: Array<{ lockKey: string; owner: string; expiresAt: string }>;
  metrics: {
    startedCount: number;
    completedCount: number;
    failedCount: number;
    retryCount: number;
    recoveryCount: number;
    duplicateCount: number;
    timeoutCount: number;
    notificationCount: number;
    queueLength: number;
  };
};

type Snapshot = {
  metrics: MetricsResponse;
  durability?: DurabilitySlice;
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
  generatedAt?: string;
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

function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value)}ms`;
}

const POLL_MS = 5_000;

/** Owner-only operational view — internal queue terms OK here. */
export function WorkQueuePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await fetch("/api/owner/work-queue/metrics", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as Snapshot | MetricsResponse;
        if (cancelled) return;
        if ("metrics" in body) {
          setData(body as Snapshot);
          setUpdatedAt(
            (body as Snapshot).generatedAt ?? new Date().toISOString(),
          );
        } else {
          setData({
            metrics: body as MetricsResponse,
            alerts: [],
            capabilities: [],
          });
          setUpdatedAt(new Date().toISOString());
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    const cancelMount = scheduleMountWork(() => {
      void load();
      timer = setInterval(() => {
        void load();
      }, POLL_MS);
    });

    return () => {
      cancelled = true;
      cancelMount();
      if (timer) clearInterval(timer);
    };
  }, []);

  if (error && !data) {
    return <p className="text-sm text-red-700">指標の取得に失敗: {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  const metrics = data.metrics;
  const durability = data.durability;
  const ageSec =
    metrics.oldestQueuedAgeMs == null
      ? "—"
      : `${Math.round(metrics.oldestQueuedAgeMs / 1000)}s`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Durability · Queue · Worker · Recovery
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Queue / Worker / Retry / Recovery / Metrics / Lease / Scheduler /
            Notification / Memory（5秒更新）
          </p>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          SoT: {durability?.storeKind ?? "—"} · updated {updatedAt ?? "—"}
          {error ? ` · warn: ${error}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Scheduler Alive"
          value={metrics.alive ? "YES" : "NO"}
          tone={metrics.alive ? "ok" : "bad"}
        />
        <Metric
          label="Queue Length"
          value={metrics.queueLength ?? metrics.waiting ?? metrics.queued}
        />
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
        <Metric label="Failure Rate" value={pct(metrics.failureRate)} />
        <Metric label="Running" value={metrics.running} />
        <Metric label="Waiting" value={metrics.waiting ?? metrics.queued} />
        <Metric label="Retry Scheduled" value={metrics.retryScheduled} />
        <Metric label="Retry Total" value={metrics.retryCount ?? durability?.metrics.retryCount ?? 0} />
        <Metric label="Recovery Total" value={metrics.recoveryCount ?? durability?.metrics.recoveryCount ?? 0} />
        <Metric label="Timeout" value={metrics.timeoutCount ?? durability?.metrics.timeoutCount ?? 0} />
        <Metric label="Duplicate" value={metrics.duplicateCount} />
        <Metric
          label="Notification"
          value={
            metrics.notificationCount ??
            durability?.notification.count ??
            0
          }
        />
        <Metric label="Started" value={metrics.startedCount ?? durability?.metrics.startedCount ?? 0} />
        <Metric label="leased" value={metrics.leased} />
        <Metric label="stuck" value={metrics.stuck} />
        <Metric label="dead-letter" value={metrics.deadLetter} />
        <Metric label="completed" value={metrics.completed} />
        <Metric label="Failed" value={metrics.failed} />
        <Metric label="Avg Delay" value={ms(metrics.averageDelayMs)} />
        <Metric label="P95 Delay" value={ms(metrics.p95ScheduleDelayMs)} />
        <Metric label="P99 Delay" value={ms(metrics.p99ScheduleDelayMs)} />
        <Metric label="Avg Exec" value={ms(metrics.averageExecutionMs)} />
        <Metric label="P95 Exec" value={ms(metrics.p95ExecutionMs)} />
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

      {durability ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Workers</h3>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {durability.worker.workers.length === 0 ? (
                <li className="text-[var(--text-secondary)]">no recent workers</li>
              ) : (
                durability.worker.workers.slice(0, 20).map((w) => (
                  <li key={w.workerId}>
                    <span className="font-mono">{w.workerId}</span> · {w.status}
                    {w.busy ? " · busy" : ""} · leases {w.leaseCount}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Leases</h3>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {durability.lease.active.length === 0 ? (
                <li className="text-[var(--text-secondary)]">no active leases</li>
              ) : (
                durability.lease.active.map((l) => (
                  <li key={l.jobId}>
                    <span className="font-mono">{l.jobId.slice(0, 8)}</span> ·{" "}
                    {l.status} · {l.leaseOwner ?? "—"} · exp{" "}
                    {l.leaseExpiresAt ?? "—"}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Retry</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              scheduled {durability.retry.scheduled} · total{" "}
              {durability.retry.totalCount}
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {durability.retry.recent.length === 0 ? (
                <li className="text-[var(--text-secondary)]">no recent retries</li>
              ) : (
                durability.retry.recent.slice(0, 15).map((r, idx) => (
                  <li key={`${r.jobId}-${idx}`}>
                    #{r.attempt} {r.reason} · {r.at}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Recovery</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              total {durability.recovery.totalCount} · success{" "}
              {pct(durability.recovery.successRate)}
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {durability.recovery.recent.length === 0 ? (
                <li className="text-[var(--text-secondary)]">no recovery events</li>
              ) : (
                durability.recovery.recent.slice(0, 15).map((e) => (
                  <li key={e.eventId}>
                    {e.kind} · {e.success ? "ok" : "fail"} ·{" "}
                    {e.jobId?.slice(0, 8) ?? "—"} · {e.createdAt}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Locks</h3>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
              {durability.locks.length === 0 ? (
                <li className="text-[var(--text-secondary)]">no active locks</li>
              ) : (
                durability.locks.map((l) => (
                  <li key={l.lockKey}>
                    {l.lockKey} · {l.owner} · exp {l.expiresAt}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold">Notification · Memory</h3>
            <p className="mt-2 text-sm">
              Notification count: {durability.notification.count}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Memory SoT: {durability.memory.sot} — {durability.memory.note}
            </p>
          </section>
        </div>
      ) : null}

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
