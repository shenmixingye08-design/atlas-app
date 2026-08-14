import {
  WORK_QUEUE_SCHEDULER_BATCH,
} from "./constants";
import { classifyDueOccurrence } from "./missed-run";
import { buildOccurrenceKey } from "./occurrence";
import { logWorkQueue } from "./observability";
import { getWorkQueueStore } from "./store";
import { defaultAutomationSteps } from "./steps/execute-step";

export type ScheduleEnqueueResult = {
  scanned: number;
  due: number;
  enqueued: number;
  deduped: number;
  advanced: number;
  delayed: number;
  missed: number;
  skipped: number;
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
};

/**
 * Scheduler tick: create occurrences + enqueue jobs only.
 * Never runs deliverable generation here.
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
  let delayed = 0;
  let missed = 0;
  let skipped = 0;
  const delaysMs: number[] = [];

  for (const candidate of due) {
    const scheduledAt = new Date(candidate.nextRun!);
    const classification = classifyDueOccurrence(scheduledAt, now);
    const occurrenceKey = buildOccurrenceKey({
      automationId: candidate.automationId,
      scheduledAt,
      timezone: candidate.timezone ?? "Asia/Tokyo",
    });

    delaysMs.push(classification.delayMs);
    await store.recordScheduleDelay(classification.delayMs);

    if (!classification.shouldExecute) {
      skipped += 1;
      logWorkQueue({
        event: "OCCURRENCE_SKIPPED",
        automationId: candidate.automationId,
        occurrenceKey,
        ownerId: candidate.ownerId,
        extra: {
          delayMs: classification.delayMs,
          disposition: classification.disposition,
        },
      });
      // Advance nextRun; never mark skipped as completed.
      await input.advanceNextRun(candidate.automationId, now);
      advanced += 1;
      continue;
    }

    if (classification.disposition === "delayed") delayed += 1;
    if (classification.disposition === "missed") missed += 1;

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
        missedDisposition:
          classification.disposition === "missed"
            ? "missed"
            : classification.disposition === "delayed"
              ? "delayed"
              : "due",
      },
      steps: defaultAutomationSteps(offline),
    });

    if (created) {
      enqueued += 1;
      logWorkQueue({
        event: "OCCURRENCE_CREATED",
        automationId: candidate.automationId,
        occurrenceKey,
        jobId: job.jobId,
        runId: job.runId,
        ownerId: candidate.ownerId,
        extra: { disposition: classification.disposition },
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
    delayed,
    missed,
    skipped,
    delaysMs,
  };
}
