import "server-only";

import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import {
  isScheduledCronEnabled,
  isSchedulerExplicitlyStopped,
} from "@/lib/work-queue/scheduler-gate";
import { getWorkQueueStore } from "@/lib/work-queue/store";

import { getSchedulerSecretConfigStatus } from "../auth";
import { getSchedulerBridgeHealth } from "../bridge/metrics";
import { getSchedulerCoreStore } from "../durable";
import { resolveSchedulerEnvironment } from "../env";
import { buildSchedulerHealthSnapshot } from "../health";
import { FORMAL_SCHEDULER_TICK_PATH } from "../types";

import type {
  SchedulerOpsAlert,
  SchedulerOpsHealth,
  SchedulerOpsMetrics,
  SchedulerOpsSnapshot,
} from "./types";

function mapAlerts(
  alerts: Awaited<ReturnType<typeof evaluateWorkQueueAlerts>>,
): SchedulerOpsAlert[] {
  return alerts.map((a) => ({
    code: a.code as SchedulerOpsAlert["code"],
    severity: a.severity,
    message: a.message,
  }));
}

/**
 * Unified Production Cutover ops snapshot — composed from durable stores + live metrics.
 * Does not invent time-series; null when a counter is unavailable.
 */
export async function buildSchedulerOpsSnapshot(
  nowMs = Date.now(),
): Promise<SchedulerOpsSnapshot> {
  const secrets = getSchedulerSecretConfigStatus();
  const environment = resolveSchedulerEnvironment();
  const diagnosticId = `sops_${Date.now().toString(36)}`;

  const coreHealth = await buildSchedulerHealthSnapshot();
  const queue = getWorkQueueStore();
  const metrics = await queue.metrics(nowMs);
  const alerts = mapAlerts(await evaluateWorkQueueAlerts(nowMs));

  let tickCount: number | null = null;
  let occurrenceCount: number | null = null;
  let missCount: number | null = null;
  let runCount: number | null = null;
  try {
    const core = getSchedulerCoreStore();
    tickCount = await core.countTicks();
    occurrenceCount = await core.countOccurrences();
    missCount = await core.countFailedOutbox();
    runCount = occurrenceCount;
  } catch {
    // leave nulls
  }

  let bridge = null;
  try {
    bridge = await getSchedulerBridgeHealth();
  } catch {
    bridge = null;
  }

  const cronEnabled = isScheduledCronEnabled();
  const explicitlyStopped = isSchedulerExplicitlyStopped();
  const running =
    cronEnabled &&
    !explicitlyStopped &&
    secrets.configured &&
    coreHealth.status !== "down" &&
    coreHealth.status !== "misconfigured";
  const healthy =
    running &&
    coreHealth.status === "ok" &&
    alerts.filter((a) => a.severity === "critical").length === 0;

  const health: SchedulerOpsHealth = {
    running,
    healthy,
    status: coreHealth.status,
    lastTickAt: coreHealth.lastTickAt,
    lastSuccessAt: coreHealth.lastSuccessAt ?? metrics.schedulerLastSuccessAt,
    lastFailureAt: coreHealth.lastFailureAt,
    dueCount: coreHealth.dueCount,
    queueCount: metrics.queued,
    oldestDueAgeMs: coreHealth.oldestDueAgeMs,
    p95DelayMs: metrics.p95ScheduleDelayMs,
    retryCount: metrics.retryScheduled,
    recoverySuccessRate: metrics.recoverySuccessRate,
    outboxPendingCount: coreHealth.outboxPendingCount,
    workerCount: metrics.workerCount,
    diagnosticId,
  };

  const opsMetrics: SchedulerOpsMetrics = {
    tickCount,
    runCount,
    occurrenceCount,
    queueCount: metrics.queued,
    missCount,
    duplicateCount: metrics.duplicateCount,
    retryCount: metrics.retryScheduled,
    recoveryCount: metrics.recoveryCount,
    recoverySuccessRate: metrics.recoverySuccessRate,
    p50DelayMs: metrics.p50ScheduleDelayMs,
    p90DelayMs: metrics.p90ScheduleDelayMs,
    p95DelayMs: metrics.p95ScheduleDelayMs,
    p99DelayMs: metrics.p99ScheduleDelayMs,
    averageDelayMs: metrics.averageDelayMs,
  };

  return {
    phase: "2-5",
    generatedAt: new Date(nowMs).toISOString(),
    environment,
    formalPath: FORMAL_SCHEDULER_TICK_PATH,
    health,
    metrics: opsMetrics,
    alerts,
    killSwitches: {
      scheduledCronEnabled: cronEnabled && !explicitlyStopped,
      dispatcherDisabled: bridge?.dispatcherDisabled ?? false,
      queueDisabled: bridge?.queueDisabled ?? false,
      previewTickAllowed:
        process.env.SCHEDULER_ALLOW_PREVIEW_TICK?.trim().toLowerCase() ===
        "true",
      schedulerSecretConfigured: secrets.configured,
    },
    sections: {
      scheduler: true,
      queue: true,
      worker: true,
      automation: true,
      health: true,
    },
  };
}
