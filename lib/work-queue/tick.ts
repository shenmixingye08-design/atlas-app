import { evaluateWorkQueueAlerts } from "./alerts";
import type { WorkerDrainResult } from "./worker";

/**
 * Production tick — Phase 2-2 delegates schedule enqueue to scheduler-core.
 * Worker drain remains via scheduler-core (existing worker, not rewritten).
 */
export async function processWorkQueueTick(options?: {
  requestOrigin?: string | null;
  scheduleLimit?: number;
  workerLimit?: number;
  workerId?: string;
}): Promise<{
  schedule: {
    scanned: number;
    due: number;
    enqueued: number;
    deduped: number;
    advanced: number;
    delaysMs: number[];
  };
  worker: WorkerDrainResult;
  alerts: Awaited<ReturnType<typeof evaluateWorkQueueAlerts>>;
}> {
  void options?.requestOrigin;
  void options?.workerId;

  const { runSchedulerCoreTick } = await import(
    "@/lib/scheduler-core/due-tick"
  );
  // Core tick already drains the worker. Capture counts from result, then
  // build a WorkerDrainResult-compatible shape for legacy callers.
  const result = await runSchedulerCoreTick({
    scheduleLimit: options?.scheduleLimit,
    workerLimit: options?.workerLimit,
  });

  const alerts = await evaluateWorkQueueAlerts();
  const worker: WorkerDrainResult = {
    workerId: "scheduler-core",
    leased: result.worker?.leased ?? 0,
    completed: result.worker?.completed ?? 0,
    failed: result.worker?.failed ?? 0,
    retried: 0,
    recovered: 0,
    completedJobs: [],
    failedJobs: [],
  };

  // Re-query recent completed/failed from store for legacy AutomationRunResult mapping.
  try {
    const { getWorkQueueStore } = await import("./store");
    const store = getWorkQueueStore();
    const completed = await store.listByStatus("completed", 50);
    const failed = await store.listByStatus("failed", 50);
    const dead = await store.listByStatus("dead_letter", 50);
    worker.completedJobs = completed.slice(0, worker.completed).map((job) => ({
      jobId: job.jobId,
      runId: job.runId,
      automationId: job.automationId,
      status: "completed" as const,
    }));
    worker.failedJobs = [...failed, ...dead]
      .slice(0, Math.max(worker.failed, 1))
      .map((job) => ({
        jobId: job.jobId,
        runId: job.runId,
        automationId: job.automationId,
        status: (job.status === "dead_letter" ? "dead_letter" : "failed") as
          | "failed"
          | "dead_letter",
        errorCode: job.errorCode,
      }));
  } catch {
    // optional legacy mapping
  }

  return {
    schedule: {
      scanned: result.dueCount,
      due: result.dueCount,
      enqueued: result.occurrenceCreatedCount,
      deduped: result.duplicateSkippedCount,
      advanced: result.nextRunUpdatedCount,
      delaysMs: [],
    },
    worker,
    alerts,
  };
}
