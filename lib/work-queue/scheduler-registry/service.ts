import { buildJobIdempotencyKey } from "../occurrence";
import { getSchedulerRegistryStore } from "./store";
import type {
  SchedulerExecutionLog,
  SchedulerScheduleRecord,
} from "./types";

/**
 * Mark schedule as Scheduled (ready) when occurrence is enqueued.
 * Writes execution log — never process-memory only.
 */
export async function markScheduleOccurrenceScheduled(input: {
  automationId: string;
  ownerId: string;
  cronExpression: string;
  timezone: string;
  presetType: string;
  nextRun: string | null;
  occurrenceKey: string;
  jobId: string | null;
  enabled?: boolean;
}): Promise<{
  schedule: SchedulerScheduleRecord;
  log: SchedulerExecutionLog;
  created: boolean;
}> {
  const store = getSchedulerRegistryStore();
  const schedule = await store.upsertSchedule({
    automationId: input.automationId,
    ownerId: input.ownerId,
    cronExpression: input.cronExpression,
    timezone: input.timezone,
    presetType: input.presetType,
    nextRun: input.nextRun,
    enabled: input.enabled ?? true,
  });

  if (schedule.status === "stopped") {
    throw new Error("scheduler_stopped: occurrence completed 禁止");
  }

  const locked = await store.tryAcquireLock({
    scheduleId: schedule.scheduleId,
    lockOwner: input.occurrenceKey,
    leaseMs: 60_000,
  });
  if (!locked) {
    // Another worker holds lock — still record dedup attempt via log unique key.
  }

  const idempotencyKey = buildJobIdempotencyKey(input.occurrenceKey);
  const { log, created } = await store.appendExecutionLog({
    scheduleId: schedule.scheduleId,
    automationId: input.automationId,
    ownerId: input.ownerId,
    jobId: input.jobId,
    occurrenceKey: input.occurrenceKey,
    idempotencyKey,
    status: "scheduled",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    errorCode: null,
    errorMessage: null,
    retryCount: schedule.retryCount,
  });

  if (created && schedule.status !== "running") {
    await store.transitionStatus({
      scheduleId: schedule.scheduleId,
      to: "scheduled",
      patch: {
        lastRun: new Date().toISOString(),
        idempotencyKey,
      },
    });
  }

  return {
    schedule: (await store.getByAutomationId(input.automationId)) ?? schedule,
    log,
    created,
  };
}

export async function markScheduleOccurrenceRunning(input: {
  automationId: string;
  occurrenceKey: string;
  jobId: string;
}): Promise<void> {
  const store = getSchedulerRegistryStore();
  const schedule = await store.getByAutomationId(input.automationId);
  if (!schedule) return;
  if (schedule.status === "stopped") {
    throw new Error("scheduler_stopped: running 禁止");
  }
  const startedAt = new Date().toISOString();
  await store.transitionStatus({
    scheduleId: schedule.scheduleId,
    to: "running",
    patch: { executionTime: startedAt },
  });
  const idempotencyKey = buildJobIdempotencyKey(input.occurrenceKey);
  const logs = await store.listLogs(500);
  const log = logs.find((l) => l.idempotencyKey === idempotencyKey);
  if (log) {
    await store.updateExecutionLog(log.logId, {
      status: "running",
      startedAt,
      jobId: input.jobId,
    });
  }
}

export async function markScheduleOccurrenceTerminal(input: {
  automationId: string;
  occurrenceKey: string;
  ok: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextRun?: string | null;
}): Promise<void> {
  const store = getSchedulerRegistryStore();
  const schedule = await store.getByAutomationId(input.automationId);
  if (!schedule) return;

  const finishedAt = new Date().toISOString();
  const started = schedule.executionTime
    ? new Date(schedule.executionTime).getTime()
    : Date.now();
  const durationMs = Math.max(0, Date.now() - started);
  const idempotencyKey = buildJobIdempotencyKey(input.occurrenceKey);
  const logs = await store.listLogs(500);
  const log = logs.find((l) => l.idempotencyKey === idempotencyKey);

  if (input.ok) {
    await store.transitionStatus({
      scheduleId: schedule.scheduleId,
      to: "completed",
      patch: {
        lastSuccess: finishedAt,
        durationMs,
        nextRun: input.nextRun ?? schedule.nextRun,
        retryCount: 0,
        lockOwner: null,
        lockExpiresAt: null,
      },
    });
    // Return to scheduled for the next occurrence window.
    await store.transitionStatus({
      scheduleId: schedule.scheduleId,
      to: "scheduled",
      patch: { executionTime: null },
    });
    if (log) {
      await store.updateExecutionLog(log.logId, {
        status: "completed",
        finishedAt,
        durationMs,
      });
    }
    return;
  }

  await store.transitionStatus({
    scheduleId: schedule.scheduleId,
    to: "failed",
    patch: {
      lastFailure: finishedAt,
      durationMs,
      retryCount: schedule.retryCount + 1,
      lockOwner: null,
      lockExpiresAt: null,
    },
  });
  // Allow retry → back to scheduled.
  await store.transitionStatus({
    scheduleId: schedule.scheduleId,
    to: "scheduled",
    patch: { executionTime: null },
  });
  if (log) {
    await store.updateExecutionLog(log.logId, {
      status: "failed",
      finishedAt,
      durationMs,
      errorCode: input.errorCode ?? "scheduler_failed",
      errorMessage: input.errorMessage ?? null,
      retryCount: schedule.retryCount + 1,
    });
  }
}

export async function setScheduleStopped(
  automationId: string,
  stopped: boolean,
): Promise<void> {
  const store = getSchedulerRegistryStore();
  const schedule = await store.getByAutomationId(automationId);
  if (!schedule) return;
  if (stopped) {
    if (schedule.status !== "stopped") {
      await store.transitionStatus({
        scheduleId: schedule.scheduleId,
        to: "stopped",
        patch: { lockOwner: null, lockExpiresAt: null },
      });
    }
  } else if (schedule.status === "stopped") {
    await store.transitionStatus({
      scheduleId: schedule.scheduleId,
      to: "scheduled",
    });
  }
}
