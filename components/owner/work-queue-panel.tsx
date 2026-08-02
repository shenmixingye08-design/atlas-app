"use client";

import { useEffect, useState } from "react";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type MetricsResponse = {
  queued: number;
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
  p95ExecutionMs: number | null;
  recoverySuccessRate: number | null;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

/** Owner-only operational view — internal queue terms OK here. */
export function WorkQueuePanel() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return scheduleMountWork(() => {
      void fetch("/api/owner/work-queue/metrics")
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as MetricsResponse;
        })
        .then(setMetrics)
        .catch((err: Error) => setError(err.message));
    });
  }, []);

  if (error) {
    return <p className="text-sm text-red-700">指標の取得に失敗: {error}</p>;
  }
  if (!metrics) {
    return <p className="text-sm text-[var(--text-secondary)]">読み込み中…</p>;
  }

  const ageSec =
    metrics.oldestQueuedAgeMs == null
      ? "—"
      : `${Math.round(metrics.oldestQueuedAgeMs / 1000)}s`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Work Queue
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Scheduler / Worker の運用指標（一般ユーザーには表示しません）
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Scheduler最終成功"
          value={metrics.schedulerLastSuccessAt ?? "—"}
        />
        <Metric label="Queue長" value={metrics.queued} />
        <Metric label="leased" value={metrics.leased} />
        <Metric label="running" value={metrics.running} />
        <Metric label="retry" value={metrics.retryScheduled} />
        <Metric label="stuck" value={metrics.stuck} />
        <Metric label="failed" value={metrics.failed} />
        <Metric label="dead-letter" value={metrics.deadLetter} />
        <Metric label="oldest queued age" value={ageSec} />
        <Metric
          label="p95 schedule delay"
          value={
            metrics.p95ScheduleDelayMs == null
              ? "—"
              : `${Math.round(metrics.p95ScheduleDelayMs)}ms`
          }
        />
        <Metric
          label="p95 execution"
          value={
            metrics.p95ExecutionMs == null
              ? "—"
              : `${Math.round(metrics.p95ExecutionMs)}ms`
          }
        />
        <Metric label="duplicate count" value={metrics.duplicateCount} />
        <Metric
          label="recovery success rate"
          value={
            metrics.recoverySuccessRate == null
              ? "—"
              : `${Math.round(metrics.recoverySuccessRate * 100)}%`
          }
        />
        <Metric label="completed" value={metrics.completed} />
      </div>
    </div>
  );
}
