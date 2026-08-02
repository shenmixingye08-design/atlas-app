/**
 * Schedule reliability alerts — failure rate, queue stall, retry spike,
 * worker/scheduler stop.
 */

import "server-only";

import { SCHEDULE_SLA_MS } from "@/lib/automation-platform/reliability/constants";
import {
  getScheduleReliabilitySnapshot,
  type ScheduleReliabilitySnapshot,
} from "@/lib/automation-platform/reliability/metrics";

export type ScheduleAlertKind =
  | "failure_rate_high"
  | "queue_stalled"
  | "retry_spike"
  | "worker_stopped"
  | "scheduler_stopped"
  | "schedule_delay_sla";

export type ScheduleAlert = {
  kind: ScheduleAlertKind;
  severity: "warning" | "critical";
  message: string;
  at: string;
  value: number | null;
};

const FAILURE_RATE_CRITICAL = 0.25;
const QUEUE_STALL_WARNING = 50;
const RETRY_SPIKE_WARNING = 30;

function getAlertBuffer(): ScheduleAlert[] {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleAlerts?: ScheduleAlert[];
  };
  if (!scope.__atlasScheduleAlerts) scope.__atlasScheduleAlerts = [];
  return scope.__atlasScheduleAlerts;
}

export function resetScheduleAlertsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleAlerts?: ScheduleAlert[];
  };
  scope.__atlasScheduleAlerts = [];
}

export function listScheduleAlerts(limit = 50): ScheduleAlert[] {
  return getAlertBuffer().slice(0, limit);
}

function pushAlert(alert: ScheduleAlert): void {
  const buf = getAlertBuffer();
  // Dedupe same kind within 2 minutes
  const recent = buf.find(
    (item) =>
      item.kind === alert.kind &&
      Date.parse(alert.at) - Date.parse(item.at) < 120_000,
  );
  if (recent) return;
  buf.unshift(alert);
  if (buf.length > 200) buf.length = 200;
}

export async function evaluateScheduleAlerts(
  snapshot?: ScheduleReliabilitySnapshot,
): Promise<ScheduleAlert[]> {
  const snap = snapshot ?? getScheduleReliabilitySnapshot();
  const at = snap.at;
  const raised: ScheduleAlert[] = [];

  const raise = (alert: ScheduleAlert) => {
    pushAlert(alert);
    raised.push(alert);
  };

  if (snap.scheduler.stale) {
    raise({
      kind: "scheduler_stopped",
      severity: "critical",
      message: "Scheduler tick が停止しています（2分以上更新なし）",
      at,
      value: null,
    });
  }

  if (snap.worker.stale && snap.queueLength > 0) {
    raise({
      kind: "worker_stopped",
      severity: "critical",
      message: "Worker が停止し Queue が残っています",
      at,
      value: snap.queueLength,
    });
  }

  if (snap.failureRate >= FAILURE_RATE_CRITICAL) {
    raise({
      kind: "failure_rate_high",
      severity: "critical",
      message: `Failure率が上昇しています（${Math.round(snap.failureRate * 100)}%）`,
      at,
      value: snap.failureRate,
    });
  }

  if (snap.queueLength >= QUEUE_STALL_WARNING) {
    raise({
      kind: "queue_stalled",
      severity: "warning",
      message: `Queue が停滞しています（${snap.queueLength}件）`,
      at,
      value: snap.queueLength,
    });
  }

  if (snap.retryCount >= RETRY_SPIKE_WARNING) {
    raise({
      kind: "retry_spike",
      severity: "warning",
      message: `Retry が急増しています（累計 ${snap.retryCount}）`,
      at,
      value: snap.retryCount,
    });
  }

  if (
    snap.p95ScheduleDelayMs != null &&
    snap.p95ScheduleDelayMs > SCHEDULE_SLA_MS
  ) {
    raise({
      kind: "schedule_delay_sla",
      severity: "critical",
      message: `予定時刻遅延 P95 が SLA(±60s) を超過（${snap.p95ScheduleDelayMs}ms）`,
      at,
      value: snap.p95ScheduleDelayMs,
    });
  }

  if (raised.length > 0) {
    try {
      const { recordMonitoringIncident } = await import(
        "@/lib/owner/monitoring/incidents"
      );
      for (const alert of raised.filter((a) => a.severity === "critical")) {
        recordMonitoringIncident({
          kind: `schedule_${alert.kind}`,
          targetId: "cron",
          message: alert.message,
          critical: true,
        });
      }
    } catch {
      // monitoring optional
    }
  }

  return raised;
}
