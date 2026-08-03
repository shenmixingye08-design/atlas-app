import "server-only";

import { ensureAutomationsHydrated } from "@/lib/automations/durable";
import { listAutomationOwnerUserIds } from "@/lib/automations/global-durable";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { isAutomationSuspendedForUser } from "@/lib/billing/subscriptions/lifecycle";
import {
  WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
  WORK_QUEUE_SCHEDULER_BATCH,
} from "@/lib/work-queue/constants";
import { getWorkQueueStore } from "@/lib/work-queue/store";

import { dispatchSchedulerOutbox } from "./bridge/dispatcher";
import type { DispatchEnqueuePayload } from "./bridge/types";
import { calculateNextRunAtIsoFromV1Schedule } from "./calculate-next-run-at";
import { getSchedulerCoreStore } from "./durable";
import type { SchedulerScheduleIndexRow } from "./durable";
import {
  assertSchedulerEnvironmentAllowed,
  resolveSchedulerEnvironment,
} from "./env";
import {
  newOutboxId,
  newSchedulerDiagnosticId,
  newSchedulerRequestId,
  newSchedulerTickId,
} from "./ids";
import { decideMisfire } from "./misfire";
import { logSchedulerCore } from "./observability";
import { buildScheduleOccurrenceKey } from "./occurrence";
import {
  DEFAULT_MISFIRE_POLICY,
  type SchedulerCoreTickResult,
  type SchedulerEnvironment,
  type SchedulerTickHistory,
} from "./types";

async function syncScheduleIndexFromAutomations(
  environment: SchedulerEnvironment,
): Promise<void> {
  const store = getSchedulerCoreStore();
  const ownerIds = await listAutomationOwnerUserIds();
  const memoryOwners = new Set(ownerIds);
  for (const row of await serverAutomationRepository.list()) {
    if (row.userId) memoryOwners.add(row.userId);
  }

  const nowIso = new Date().toISOString();
  for (const userId of memoryOwners) {
    await ensureAutomationsHydrated(userId);
    if (isAutomationSuspendedForUser(userId)) {
      continue;
    }
    const automations = await serverAutomationRepository.list({ userId });
    for (const automation of automations) {
      if (automation.schedule.kind !== "schedule") continue;
      const endAt =
        automation.timing?.endCondition?.type === "until_date"
          ? automation.timing.endCondition.until
          : null;
      const row: SchedulerScheduleIndexRow = {
        automationId: automation.id,
        ownerId: userId,
        environment,
        enabled: automation.enabled,
        paused: !automation.enabled,
        deletedAt: null,
        nextRunAt: automation.nextRun,
        timezone: automation.schedule.timezone || "Asia/Tokyo",
        endAt,
        misfirePolicy: DEFAULT_MISFIRE_POLICY,
        name: automation.name,
        updatedAt: nowIso,
        createdAt: automation.createdAt ?? nowIso,
      };
      await store.upsertSchedule(row);
    }
  }
}

/**
 * Formal Scheduler due tick — Phase 2-3 bridge:
 * Scheduled → OccurrenceCreated → Outbox(dispatch_enqueue)
 * → Dispatcher → Durable Queue (Queued) → Worker lease (Leased/Running)
 * nextRunAt advances ONLY after successful Queue accept (via Outbox).
 */
export async function runSchedulerCoreTick(options?: {
  requestId?: string;
  now?: Date;
  scheduleLimit?: number;
  workerLimit?: number;
  skipWorkerDrain?: boolean;
  skipIndexSync?: boolean;
}): Promise<SchedulerCoreTickResult> {
  const environment = resolveSchedulerEnvironment();
  const requestId = options?.requestId ?? newSchedulerRequestId();
  const tickId = newSchedulerTickId();
  const diagnosticId = newSchedulerDiagnosticId("tick");
  const startedAt = new Date().toISOString();
  const now = options?.now ?? new Date();

  logSchedulerCore({
    event: "SCHEDULER_REQUEST_RECEIVED",
    schedulerTickId: tickId,
    requestId,
    diagnosticId,
    extra: { environment },
  });

  const envGate = assertSchedulerEnvironmentAllowed(environment);
  if (!envGate.ok) {
    return {
      requestStatus: "ok",
      schedulerStatus: "skipped",
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: 0,
      occurrenceCreatedCount: 0,
      duplicateSkippedCount: 0,
      failedCount: 0,
      outboxCreatedCount: 0,
      nextRunUpdatedCount: 0,
      misfireSkippedCount: 0,
      errorCode: envGate.errorCode,
      message: envGate.message,
    };
  }

  if (process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() === "false") {
    return {
      requestStatus: "ok",
      schedulerStatus: "skipped",
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: 0,
      occurrenceCreatedCount: 0,
      duplicateSkippedCount: 0,
      failedCount: 0,
      outboxCreatedCount: 0,
      nextRunUpdatedCount: 0,
      misfireSkippedCount: 0,
      errorCode: "scheduled_cron_disabled",
      message: "ENABLE_SCHEDULED_CRON=false",
    };
  }

  let core;
  try {
    core = getSchedulerCoreStore();
  } catch (error) {
    return {
      requestStatus: "ok",
      schedulerStatus: "failed",
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: 0,
      occurrenceCreatedCount: 0,
      duplicateSkippedCount: 0,
      failedCount: 1,
      outboxCreatedCount: 0,
      nextRunUpdatedCount: 0,
      misfireSkippedCount: 0,
      errorCode: "scheduler_store_unavailable",
      message: error instanceof Error ? error.message : "store unavailable",
    };
  }

  const history: SchedulerTickHistory = {
    schedulerTickId: tickId,
    requestId,
    environment,
    startedAt,
    completedAt: null,
    durationMs: null,
    dueCount: 0,
    occurrenceCreatedCount: 0,
    duplicateSkippedCount: 0,
    invalidScheduleCount: 0,
    failedCount: 0,
    outboxCreatedCount: 0,
    nextRunUpdatedCount: 0,
    misfireSkippedCount: 0,
    status: "failed",
    errorCode: null,
    diagnosticId,
  };

  try {
    await core.insertTick(history);
  } catch (error) {
    return {
      requestStatus: "ok",
      schedulerStatus: "failed",
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: 0,
      occurrenceCreatedCount: 0,
      duplicateSkippedCount: 0,
      failedCount: 1,
      outboxCreatedCount: 0,
      nextRunUpdatedCount: 0,
      misfireSkippedCount: 0,
      errorCode: "history_insert_failed",
      message: error instanceof Error ? error.message : "history failed",
    };
  }

  logSchedulerCore({
    event: "SCHEDULER_TICK_STARTED",
    schedulerTickId: tickId,
    requestId,
    diagnosticId,
  });

  try {
    if (!options?.skipIndexSync) {
      await syncScheduleIndexFromAutomations(environment);
    }

    const due = await core.listDueSchedules({
      environment,
      nowIso: now.toISOString(),
      limit: options?.scheduleLimit ?? WORK_QUEUE_SCHEDULER_BATCH,
    });
    history.dueCount = due.length;
    logSchedulerCore({
      event: "DUE_SCHEDULES_LOADED",
      schedulerTickId: tickId,
      requestId,
      extra: { dueCount: due.length, lifecycle: "Scheduled" },
    });

    for (const schedule of due) {
      const scheduledAt = new Date(schedule.nextRunAt!);
      const misfire = decideMisfire({
        policy: schedule.misfirePolicy,
        scheduledAt,
        now,
      });
      if (misfire.action === "skip_missed") {
        history.misfireSkippedCount += 1;
        const automation = await serverAutomationRepository.findById(
          schedule.automationId,
        );
        if (automation && automation.schedule.kind === "schedule") {
          const next = calculateNextRunAtIsoFromV1Schedule(
            automation.schedule,
            new Date(scheduledAt.getTime() + 1),
          );
          await serverAutomationRepository.update(schedule.automationId, {
            nextRun: next,
          });
          await core.updateScheduleNextRun(schedule.automationId, next);
          history.nextRunUpdatedCount += 1;
        }
        logSchedulerCore({
          event: "MISFIRE_SKIPPED",
          schedulerTickId: tickId,
          automationId: schedule.automationId,
          errorCode: misfire.reason,
        });
        continue;
      }

      const occurrenceKey = buildScheduleOccurrenceKey({
        automationId: schedule.automationId,
        scheduledAt,
        timezone: schedule.timezone,
      });

      logSchedulerCore({
        event: "OCCURRENCE_CREATED",
        schedulerTickId: tickId,
        automationId: schedule.automationId,
        occurrenceId: occurrenceKey,
        extra: { lifecycle: "OccurrenceCreated" },
      });

      const enqueuePayload: DispatchEnqueuePayload = {
        action: "dispatch_enqueue",
        ownerId: schedule.ownerId,
        automationId: schedule.automationId,
        automationName: schedule.name,
        occurrenceKey,
        scheduledAt: scheduledAt.toISOString(),
        timezone: schedule.timezone,
        priority: 0,
        maxAttempts: WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
        // Proof harness only (Phase 2-4). Default false — never enables AI/product offline mode by itself.
        offlineArtifacts:
          process.env.ATLAS_WALL_CLOCK_PROOF_OFFLINE?.trim().toLowerCase() ===
          "true",
        state: "OccurrenceCreated",
      };

      try {
        // Durable Outbox first — NEVER enqueue fire-and-forget; NEVER advance nextRun here.
        const outbox = await core.insertOutbox({
          outboxId: newOutboxId(),
          tickId,
          occurrenceKey,
          automationId: schedule.automationId,
          ownerId: schedule.ownerId,
          runId: "pending",
          jobId: "pending",
          scheduledAt: scheduledAt.toISOString(),
          payload: enqueuePayload,
          status: "pending",
          availableAt: new Date().toISOString(),
          attempt: 0,
          dispatchedAt: null,
          errorCode: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (outbox.created) {
          history.outboxCreatedCount += 1;
          logSchedulerCore({
            event: "OUTBOX_CREATED",
            schedulerTickId: tickId,
            automationId: schedule.automationId,
            occurrenceId: occurrenceKey,
            extra: { action: "dispatch_enqueue" },
          });
        } else {
          history.duplicateSkippedCount += 1;
          logSchedulerCore({
            event: "OCCURRENCE_DUPLICATE_SKIPPED",
            schedulerTickId: tickId,
            automationId: schedule.automationId,
            occurrenceId: occurrenceKey,
            extra: { reason: "outbox_duplicate" },
          });
        }
      } catch (error) {
        history.failedCount += 1;
        logSchedulerCore({
          event: "SCHEDULER_TICK_FAILED",
          schedulerTickId: tickId,
          automationId: schedule.automationId,
          errorCode:
            error instanceof Error
              ? error.message.slice(0, 80)
              : "outbox_insert_failed",
        });
      }
    }

    // Outbox → Dispatcher → Durable Queue → Worker lease start
    const dispatched = await dispatchSchedulerOutbox({
      limit: 200,
      startWorkerLease: options?.skipWorkerDrain !== true,
      workerLimit: options?.workerLimit,
    });

    history.occurrenceCreatedCount += dispatched.dispatched;
    history.duplicateSkippedCount += dispatched.duplicates;
    history.failedCount += dispatched.failed;
    history.nextRunUpdatedCount += dispatched.nextRunAdvanced;

    const queue = getWorkQueueStore();
    const completedAt = new Date().toISOString();
    history.completedAt = completedAt;
    history.durationMs = Date.parse(completedAt) - Date.parse(startedAt);
    history.status =
      history.failedCount > 0
        ? history.occurrenceCreatedCount > 0 || dispatched.dispatched > 0
          ? "partial"
          : "failed"
        : "succeeded";
    history.errorCode =
      history.status === "succeeded" ? null : "scheduler_partial_or_failed";

    await core.completeTick(history);
    await queue.recordSchedulerSuccess(completedAt);

    logSchedulerCore({
      event: "SCHEDULER_TICK_COMPLETED",
      schedulerTickId: tickId,
      requestId,
      diagnosticId,
      durationMs: history.durationMs,
      status: history.status,
      extra: {
        dueCount: history.dueCount,
        dispatched: dispatched.dispatched,
        leased: dispatched.leaseStarted,
        outboxCreatedCount: history.outboxCreatedCount,
      },
    });

    return {
      requestStatus: "ok",
      schedulerStatus: history.status,
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: history.dueCount,
      occurrenceCreatedCount: history.occurrenceCreatedCount,
      duplicateSkippedCount: history.duplicateSkippedCount,
      failedCount: history.failedCount,
      outboxCreatedCount: history.outboxCreatedCount,
      nextRunUpdatedCount: history.nextRunUpdatedCount,
      misfireSkippedCount: history.misfireSkippedCount,
      worker: {
        completed: dispatched.workerCompleted,
        failed: dispatched.workerFailed,
        leased: dispatched.leaseStarted,
      },
      errorCode: history.errorCode,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    history.completedAt = completedAt;
    history.durationMs = Date.parse(completedAt) - Date.parse(startedAt);
    history.status = "failed";
    history.failedCount += 1;
    history.errorCode =
      error instanceof Error ? error.message.slice(0, 120) : "tick_failed";
    try {
      await core.completeTick(history);
    } catch {
      // already failing
    }
    logSchedulerCore({
      event: "SCHEDULER_TICK_FAILED",
      schedulerTickId: tickId,
      requestId,
      diagnosticId,
      errorCode: history.errorCode,
      status: "failed",
    });
    return {
      requestStatus: "ok",
      schedulerStatus: "failed",
      tickId,
      requestId,
      diagnosticId,
      environment,
      dueCount: history.dueCount,
      occurrenceCreatedCount: history.occurrenceCreatedCount,
      duplicateSkippedCount: history.duplicateSkippedCount,
      failedCount: history.failedCount,
      outboxCreatedCount: history.outboxCreatedCount,
      nextRunUpdatedCount: history.nextRunUpdatedCount,
      misfireSkippedCount: history.misfireSkippedCount,
      errorCode: history.errorCode,
      message: history.errorCode,
    };
  }
}
