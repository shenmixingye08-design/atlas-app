import {
  isScheduledCronEnabled,
  isSchedulerExplicitlyStopped,
} from "./scheduler-gate";
import { getWorkQueueStore } from "./store";

export type WorkQueueAlert = {
  code:
    | "scheduler_stale"
    | "scheduler_stopped"
    | "queue_backlog"
    | "worker_stale"
    | "stuck_jobs"
    | "failure_spike"
    | "retry_spike"
    | "duplicate_detected"
    | "dead_letter"
    | "success_rate_low";
  severity: "warning" | "critical";
  message: string;
};

const SCHEDULER_STALE_MS = 5 * 60_000;
const QUEUE_BACKLOG_WARN = 50;
const STUCK_WARN = 1;

/**
 * Evaluate operational alerts. Uses owner notification emitters when critical.
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
      code: "worker_stale",
      severity: "critical",
      message: "Worker が停止または応答していません",
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

  if (metrics.duplicateCount > 0 && metrics.queued + metrics.running > 0) {
    // Duplicates prevented by unique constraint — count is informational.
    // Alert only if somehow rising without completions (logic bug).
  }

  if (metrics.retryScheduled >= 20) {
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
