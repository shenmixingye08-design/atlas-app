import { recordMonitoringIncident } from "@/lib/owner/monitoring";

import { getSchedulerAliveState, listQueueDepthSamples } from "./history-store";
import { computeSchedulerMetrics } from "./metrics";
import { getSchedulerQueueSnapshot } from "./queue";
import type { SchedulerAlert } from "./types";

export const SCHEDULER_SUCCESS_RATE_THRESHOLD = 0.95;
export const SCHEDULER_QUEUE_GROWTH_THRESHOLD = 50;

export type SchedulerAlertThresholds = {
  minSuccessRate: number;
  queueGrowth: number;
  minSamplesForSuccessRate: number;
};

const DEFAULT_THRESHOLDS: SchedulerAlertThresholds = {
  minSuccessRate: SCHEDULER_SUCCESS_RATE_THRESHOLD,
  queueGrowth: SCHEDULER_QUEUE_GROWTH_THRESHOLD,
  minSamplesForSuccessRate: 5,
};

export async function evaluateSchedulerAlerts(options?: {
  thresholds?: Partial<SchedulerAlertThresholds>;
  emitIncidents?: boolean;
  nowMs?: number;
}): Promise<SchedulerAlert[]> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options?.thresholds };
  const now = new Date(options?.nowMs ?? Date.now()).toISOString();
  const metrics = computeSchedulerMetrics({ nowMs: options?.nowMs });
  const alive = getSchedulerAliveState();
  const queue = await getSchedulerQueueSnapshot();
  const alerts: SchedulerAlert[] = [];

  if (alive.stopped || alive.tickCount === 0 || alive.lastTickOk === false) {
    alerts.push({
      id: "scheduler_stopped",
      severity: "critical",
      title: "Scheduler停止",
      message: alive.lastTickError ?? "Scheduler が停止、または tick 実績がありません。",
      metric: "schedulerAlive",
      value: alive.alive ? "alive" : "stopped",
      threshold: "alive",
      at: now,
    });
  }

  if (
    metrics.successRate != null &&
    metrics.total >= thresholds.minSamplesForSuccessRate &&
    metrics.successRate < thresholds.minSuccessRate
  ) {
    alerts.push({
      id: "success_rate_low",
      severity: "critical",
      title: "Scheduler成功率が低下しています",
      message: `成功率が ${(metrics.successRate * 100).toFixed(1)}% で閾値 ${(thresholds.minSuccessRate * 100).toFixed(0)}% を下回っています。`,
      metric: "successRate",
      value: metrics.successRate,
      threshold: thresholds.minSuccessRate,
      at: now,
    });
  }

  const samples = listQueueDepthSamples();
  const rising =
    samples.length >= 3 &&
    samples[0]! >= thresholds.queueGrowth &&
    samples.every((v, i) => i === 0 || v >= (samples[i - 1] ?? v));

  if (queue.queueSize >= thresholds.queueGrowth || rising) {
    alerts.push({
      id: "queue_growth",
      severity: "warn",
      title: "Queue増加",
      message: `待機中ジョブが増加しています（queueSize=${queue.queueSize}）。`,
      metric: "queueSize",
      value: queue.queueSize,
      threshold: thresholds.queueGrowth,
      at: now,
    });
  }

  if (options?.emitIncidents !== false) {
    for (const alert of alerts) {
      if (alert.severity !== "critical") continue;
      recordMonitoringIncident({
        kind: `scheduler_${alert.id}`,
        targetId: "cron",
        message: `${alert.title}: ${alert.message}`,
        critical: true,
        source: "scheduler_alerts",
      });
    }
  }

  return alerts;
}
