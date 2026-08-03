import { presetToCron } from "@/lib/automations/schedule";

import {
  WORK_QUEUE_SCHEDULER_BATCH,
} from "./constants";
import { buildOccurrenceKey } from "./occurrence";
import { logWorkQueue } from "./observability";
import { markScheduleOccurrenceScheduled } from "./scheduler-registry/service";
import { getWorkQueueStore } from "./store";
import { defaultAutomationSteps } from "./steps/execute-step";

export type ScheduleEnqueueResult = {
  scanned: number;
  due: number;
  enqueued: number;
  deduped: number;
  advanced: number;
  delaysMs: number[];
};

export type DueAutomationCandidate = {
  automationId: string;
  ownerId: string;
  name: string;
  nextRun: string | null;
  timezone?: string;
  enabled: boolean;
  paused?: boolean;
  assignment?: string;
  offlineArtifacts?: boolean;
  /** Cron SoT expression for this automation (from presetToCron). */
  cronExpression?: string;
  presetType?: string;
};

/**
 * Scheduler tick: create occurrences + enqueue jobs only.
 * Never runs deliverable generation here.
 * Persists Scheduler registry: Scheduled status + execution log (DB/file SoT).
 */
export async function enqueueDueAutomations(input: {
  candidates: DueAutomationCandidate[];
  now?: Date;
  limit?: number;
  advanceNextRun: (automationId: string, from: Date) => Promise<string | null>;
}): Promise<ScheduleEnqueueResult> {
  const store = getWorkQueueStore();
  const now = input.now ?? new Date();
  const limit = input.limit ?? WORK_QUEUE_SCHEDULER_BATCH;
  logWorkQueue({ event: "SCHEDULE_TICK_STARTED", extra: { limit } });

  const due = input.candidates
    .filter((c) => c.enabled && !c.paused && c.nextRun)
    .filter((c) => new Date(c.nextRun!).getTime() <= now.getTime())
    .slice(0, limit);

  let enqueued = 0;
  let deduped = 0;
  let advanced = 0;
  const delaysMs: number[] = [];

  for (const candidate of due) {
    const scheduledAt = new Date(candidate.nextRun!);
    const timezone = candidate.timezone ?? "Asia/Tokyo";
    const occurrenceKey = buildOccurrenceKey({
      automationId: candidate.automationId,
      scheduledAt,
      timezone,
    });

    const delayMs = Math.max(0, now.getTime() - scheduledAt.getTime());
    delaysMs.push(delayMs);
    await store.recordScheduleDelay(delayMs);

    const offline = Boolean(candidate.offlineArtifacts);
    const { job, created } = await store.enqueue({
      ownerId: candidate.ownerId,
      automationId: candidate.automationId,
      occurrenceKey,
      scheduleId: candidate.automationId,
      scheduledAt: scheduledAt.toISOString(),
      payload: {
        kind: offline ? "fixture" : "automation",
        assignment: candidate.assignment,
        automationName: candidate.name,
        triggerType: "automation",
        offlineArtifacts: offline,
      },
      steps: defaultAutomationSteps(offline),
    });

    const cronExpression =
      candidate.cronExpression ??
      (candidate.presetType === "minutely"
        ? "* * * * *"
        : candidate.presetType === "hourly"
          ? "0 * * * *"
          : "0 9 * * *");
    const presetType = candidate.presetType ?? "daily";

    // Always persist registry + log (idempotent on occurrence).
    try {
      await markScheduleOccurrenceScheduled({
        automationId: candidate.automationId,
        ownerId: candidate.ownerId,
        cronExpression,
        timezone,
        presetType,
        nextRun: candidate.nextRun,
        occurrenceKey,
        jobId: job.jobId,
        enabled: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("scheduler_stopped")) {
        logWorkQueue({
          event: "SCHEDULE_TICK_STARTED",
          automationId: candidate.automationId,
          extra: { skipped: "scheduler_stopped" },
        });
        continue;
      }
      throw error;
    }

    if (created) {
      enqueued += 1;
      logWorkQueue({
        event: "OCCURRENCE_CREATED",
        automationId: candidate.automationId,
        occurrenceKey,
        jobId: job.jobId,
        runId: job.runId,
        ownerId: candidate.ownerId,
      });
      logWorkQueue({
        event: "JOB_ENQUEUED",
        automationId: candidate.automationId,
        occurrenceKey,
        jobId: job.jobId,
        runId: job.runId,
        ownerId: candidate.ownerId,
      });
    } else {
      deduped += 1;
      logWorkQueue({
        event: "DUPLICATE_OCCURRENCE",
        automationId: candidate.automationId,
        occurrenceKey,
        jobId: job.jobId,
        ownerId: candidate.ownerId,
      });
    }

    // Always advance nextRun so we never mass-replay past occurrences.
    await input.advanceNextRun(candidate.automationId, now);
    advanced += 1;
  }

  await store.recordSchedulerSuccess(now.toISOString());
  return {
    scanned: input.candidates.length,
    due: due.length,
    enqueued,
    deduped,
    advanced,
    delaysMs,
  };
}

/** Helper for callers that have a full AutomationSchedule. */
export function cronFromPresetType(
  presetType: string,
  fields?: { minute?: number; hour?: number; dayOfWeek?: number; dayOfMonth?: number },
): string {
  switch (presetType) {
    case "minutely":
      return presetToCron({ type: "minutely" });
    case "hourly":
      return presetToCron({ type: "hourly", minute: fields?.minute ?? 0 });
    case "weekly":
      return presetToCron({
        type: "weekly",
        dayOfWeek: fields?.dayOfWeek ?? 1,
        hour: fields?.hour ?? 9,
        minute: fields?.minute ?? 0,
      });
    case "monthly":
      return presetToCron({
        type: "monthly",
        dayOfMonth: fields?.dayOfMonth ?? 1,
        hour: fields?.hour ?? 9,
        minute: fields?.minute ?? 0,
      });
    case "daily":
    default:
      return presetToCron({
        type: "daily",
        hour: fields?.hour ?? 9,
        minute: fields?.minute ?? 0,
      });
  }
}
