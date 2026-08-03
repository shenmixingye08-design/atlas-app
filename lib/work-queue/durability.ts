/**
 * Production Blocker #4 — durability snapshot helpers.
 * DB is Single Source of Truth; process memory is cache only.
 */
import type { WorkDurabilitySnapshot } from "./durability-types";
import { getWorkQueueStore } from "./store";

/** Owner realtime durability snapshot (Queue/Worker/Retry/Recovery/…). */
export async function buildDurabilitySnapshot(
  nowMs = Date.now(),
): Promise<WorkDurabilitySnapshot> {
  const store = getWorkQueueStore();
  const metrics = await store.metrics(nowMs);
  const workers = (await store.listWorkers?.(nowMs)) ?? [];
  const recoveryEvents = (await store.listRecoveryEvents?.(30)) ?? [];
  const locks = (await store.listLocks?.(nowMs)) ?? [];
  const leases = (await store.listActiveLeases?.(50)) ?? [];
  const recentRetries = (await store.listRecentRetries?.(30)) ?? [];
  const counters = (await store.getMetricCounters?.()) ?? {
    retry_count: metrics.retryCount,
    recovery_count: metrics.recoveryCount,
    duplicate_count: metrics.duplicateCount,
    timeout_count: metrics.timeoutCount,
    notification_count: metrics.notificationCount,
    job_started_count: metrics.startedCount,
    job_completed_count: metrics.completed,
    job_failed_count: metrics.failed,
  };

  return {
    storeKind: store.kind,
    generatedAt: new Date(nowMs).toISOString(),
    queue: {
      queued: metrics.queued,
      waiting: metrics.waiting,
      leased: metrics.leased,
      running: metrics.running,
      retryScheduled: metrics.retryScheduled,
      stuck: metrics.stuck,
      failed: metrics.failed,
      deadLetter: metrics.deadLetter,
      completed: metrics.completed,
      queueLength: metrics.queueLength,
    },
    worker: {
      workerCount: metrics.workerCount,
      busyPercent: metrics.workerBusyPercent,
      workers,
    },
    retry: {
      scheduled: metrics.retryScheduled,
      totalCount: counters.retry_count,
      recent: recentRetries,
    },
    recovery: {
      totalCount: counters.recovery_count,
      successRate: metrics.recoverySuccessRate,
      recent: recoveryEvents,
    },
    metrics: {
      startedCount: counters.job_started_count,
      completedCount: counters.job_completed_count,
      failedCount: counters.job_failed_count,
      successRate: metrics.successRate,
      failureRate: metrics.failureRate,
      averageExecutionMs: metrics.averageExecutionMs,
      p95ExecutionMs: metrics.p95ExecutionMs,
      retryCount: counters.retry_count,
      recoveryCount: counters.recovery_count,
      duplicateCount: counters.duplicate_count,
      timeoutCount: counters.timeout_count,
      notificationCount: counters.notification_count,
      queueLength: metrics.queueLength,
      schedulerLastSuccessAt: metrics.schedulerLastSuccessAt,
      alive: metrics.alive,
    },
    lease: {
      leased: metrics.leased,
      stuck: metrics.stuck,
      active: leases,
    },
    scheduler: {
      alive: metrics.alive,
      lastSuccessAt: metrics.schedulerLastSuccessAt,
      averageDelayMs: metrics.averageDelayMs,
      p95DelayMs: metrics.p95ScheduleDelayMs,
    },
    notification: {
      count: counters.notification_count,
      durableDomainKey: "atlasNotifications",
      processMemoryIsCacheOnly: true,
    },
    memory: {
      sot: "durable_domain",
      durableDomainKey: "atlasPersonalMemory",
      processMemoryIsCacheOnly: true,
      note: "Memory SoT is durable PersonalizationContext / Personal Memory domain — process buffers are cache only",
    },
    locks,
  };
}
