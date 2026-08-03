import { getWorkQueueStore } from "./store";
import { defaultAutomationSteps } from "./steps/execute-step";
import { buildOccurrenceKey } from "./occurrence";
import { logWorkQueue } from "./observability";
import type { WorkJobRecord } from "./types";

/**
 * Enqueue a manual "run now" job — never executes steps in the API request.
 * Worker drain applies the work under lease.
 */
export async function enqueueManualAutomationRun(input: {
  automationId: string;
  ownerId: string;
  automationName: string;
  assignment?: string;
  requestOrigin?: string | null;
  offlineArtifacts?: boolean;
  now?: Date;
}): Promise<{ job: WorkJobRecord; created: boolean }> {
  const now = input.now ?? new Date();
  const occurrenceKey = buildOccurrenceKey({
    automationId: input.automationId,
    scheduledAt: now,
    timezone: "UTC",
    suffix: `manual_${now.getTime()}`,
  });
  const store = getWorkQueueStore();
  const offline = Boolean(input.offlineArtifacts);
  const { job, created } = await store.enqueue({
    ownerId: input.ownerId,
    automationId: input.automationId,
    occurrenceKey,
    scheduleId: input.automationId,
    scheduledAt: now.toISOString(),
    payload: {
      kind: offline ? "fixture" : "automation",
      assignment: input.assignment,
      automationName: input.automationName,
      requestOrigin: input.requestOrigin ?? null,
      triggerType: "manual",
      offlineArtifacts: offline,
    },
    steps: defaultAutomationSteps(offline),
  });
  logWorkQueue({
    event: created ? "JOB_ENQUEUED" : "DUPLICATE_OCCURRENCE",
    automationId: input.automationId,
    occurrenceKey,
    jobId: job.jobId,
    runId: job.runId,
    ownerId: input.ownerId,
  });
  return { job, created };
}
