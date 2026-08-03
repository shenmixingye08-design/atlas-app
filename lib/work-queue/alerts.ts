import { getSchedulerBridgeHealth } from "@/lib/scheduler-core/bridge/metrics";
import { getSchedulerCoreStore } from "@/lib/scheduler-core/durable";
import { resolveSchedulerEnvironment } from "@/lib/scheduler-core/env";

import {
  isScheduledCronEnabled,
  isSchedulerExplicitlyStopped,
} from "./scheduler-gate";
import { getWorkQueueStore } from "./store";

export type WorkQueueAlert = {
  code:
    | "scheduler_stale"
    | "scheduler_stopped"
    | "due_backlog"
    | "queue_backlog"
    | "worker_stale"
    | "worker_stopped"
    | "stuck_jobs"
    | "failure_spike"
    | "retry_spike"
    | "duplicate_detected"
    | "miss_detected"
    | "recovery_failed"
    | "p95_delay_exceeded"
    | "dead_letter"
    | "success_rate_low"
    | "dispatcher_disabled"
    | "queue_disabled";
  severity: "warning" | "critical";
  message: string;
};

const SCHEDULER_STALE_MS = 5 * 60_000;
const QUEUE_BACKLOG_WARN = 50;
const DUE_BACKLOG_WARN = 20;
const OLDEST_DUE_WARN_MS = 15 * 60_000;
const STUCK_WARN = 1;
const P95_DELAY_WARN_MS = 120_000;
const RETRY_SPIKE = 20;

/**
 * Evaluate operational alerts. Uses owner notification emitters when critical.
 * Phase 2-5: due backlog / miss / duplicate / recovery fail / p95 / kill switches.
 */
export async function evaluateWorkQueueAlerts(
  nowMs = Date.now(),
): Promise<WorkQueueAlert[]> {
  const store = getWorkQueueStore();
  const metrics = await store.metrics(nowMs);
  const alerts: WorkQueueAlert[] = [];

  if (!isScheduledCronEnabled() || isSchedulerExplicitlyStopped()) {
    alerts.push({
      code: "scheduler_stopped",
      severity: "critical",
      message: "Scheduler が停止しています（completed 禁止）",
    });
  }

  if (metrics.schedulerLastSuccessAt) {
    const age =
      nowMs - new Date(metrics.schedulerLastSuccessAt).getTime();
    if (age > SCHEDULER_STALE_MS) {
      alerts.push({
        code: "scheduler_stale",
        severity: "critical",
        message: `Scheduler has not succeeded for ${Math.round(age / 1000)}s`,
      });
    }
  }

  if (metrics.alive === false) {
    alerts.push({
      code: "scheduler_stopped",
      severity: "critical",
      message: "Scheduler Alive = NO",
    });
  }

  if (
    metrics.workerCount === 0 &&
    (metrics.running > 0 || metrics.leased > 0 || metrics.stuck > 0)
  ) {
    alerts.push({
      code: "worker_stopped",
      severity: "critical",
      message: "Worker が停止または応答していません",
    });
    alerts.push({
      code: "worker_stale",
      severity: "critical",
      message: "Worker stale (lease/running without active worker)",
    });
  }

  if (
    metrics.successRate != null &&
    metrics.completed + metrics.failed + metrics.deadLetter >= 20 &&
    metrics.successRate < 0.95
  ) {
    alerts.push({
      code: "success_rate_low",
      severity: "critical",
      message: `Success Rate ${(metrics.successRate * 100).toFixed(1)}% < 95%`,
    });
  }

  if (metrics.queued >= QUEUE_BACKLOG_WARN) {
    alerts.push({
      code: "queue_backlog",
      severity: "warning",
      message: `Queue depth ${metrics.queued}`,
    });
  }

  if (metrics.stuck >= STUCK_WARN) {
    alerts.push({
      code: "stuck_jobs",
      severity: "critical",
      message: `Stuck jobs: ${metrics.stuck}`,
    });
  }

  if (metrics.deadLetter > 0) {
    alerts.push({
      code: "dead_letter",
      severity: "critical",
      message: `Dead-letter jobs: ${metrics.deadLetter}`,
    });
  }

  if (metrics.duplicateCount > 0) {
    alerts.push({
      code: "duplicate_detected",
      severity: "warning",
      message: `Duplicate enqueue blocked count: ${metrics.duplicateCount}`,
    });
  }

  if (metrics.retryScheduled >= RETRY_SPIKE) {
    alerts.push({
      code: "retry_spike",
      severity: "warning",
      message: `Retry scheduled: ${metrics.retryScheduled}`,
    });
  }

  if (metrics.failed >= 10) {
    alerts.push({
      code: "failure_spike",
      severity: "critical",
      message: `Failed jobs: ${metrics.failed}`,
    });
  }

  if (
    metrics.p95ScheduleDelayMs != null &&
    metrics.p95ScheduleDelayMs > P95_DELAY_WARN_MS
  ) {
    alerts.push({
      code: "p95_delay_exceeded",
      severity: "critical",
      message: `P95 schedule delay ${Math.round(metrics.p95ScheduleDelayMs)}ms > ${P95_DELAY_WARN_MS}ms`,
    });
  }

  if (
    metrics.recoveryCount != null &&
    metrics.recoveryCount >= 5 &&
    metrics.recoverySuccessRate != null &&
    metrics.recoverySuccessRate < 0.8
  ) {
    alerts.push({
      code: "recovery_failed",
      severity: "critical",
      message: `Recovery success rate ${(metrics.recoverySuccessRate * 100).toFixed(1)}% < 80%`,
    });
  }

  try {
    const bridge = await getSchedulerBridgeHealth();
    if (bridge.dispatcherDisabled) {
      alerts.push({
        code: "dispatcher_disabled",
        severity: "critical",
        message: "SCHEDULER_BRIDGE_DISPATCHER_DISABLED=true",
      });
    }
    if (bridge.queueDisabled) {
      alerts.push({
        code: "queue_disabled",
        severity: "critical",
        message: "SCHEDULER_BRIDGE_QUEUE_DISABLED=true",
      });
    }
    if (bridge.failedEnqueueCount > 0 && bridge.outboxPendingCount > 0) {
      alerts.push({
        code: "miss_detected",
        severity: "critical",
        message: `Failed enqueue ${bridge.failedEnqueueCount} with outbox pending ${bridge.outboxPendingCount}`,
      });
    }
  } catch {
    // bridge optional when store unavailable
  }

  try {
    const core = getSchedulerCoreStore();
    const env = resolveSchedulerEnvironment();
    const due = await core.listDueSchedules({
      environment: env,
      nowIso: new Date(nowMs).toISOString(),
      limit: 1000,
    });
    const oldestDue = await core.oldestDueAgeMs(env, nowMs);
    if (due.length >= DUE_BACKLOG_WARN || (oldestDue ?? 0) > OLDEST_DUE_WARN_MS) {
      alerts.push({
        code: "due_backlog",
        severity: "warning",
        message: `Due backlog count=${due.length} oldestAgeMs=${oldestDue ?? 0}`,
      });
    }
    const failedOutbox = await core.countFailedOutbox();
    if (failedOutbox > 0) {
      alerts.push({
        code: "miss_detected",
        severity: "critical",
        message: `Failed outbox rows (miss signal): ${failedOutbox}`,
      });
    }
  } catch {
    // scheduler store may be unavailable in some test contexts
  }

  for (const alert of alerts.filter((a) => a.severity === "critical")) {
    try {
      const { notifyOwnerSystemIncident } = await import(
        "@/lib/notifications/emitters"
      );
      notifyOwnerSystemIncident(`[work-queue] ${alert.code}: ${alert.message}`);
    } catch {
      // owner notify optional in tests
    }
  }

  return alerts;
}
