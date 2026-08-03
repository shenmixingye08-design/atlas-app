import { logWorkQueue } from "./observability";
import { getWorkQueueStore } from "./store";
import { computeResumeNextRunIso, computeSkipNextRunIso } from "./schedule-math";
import type { AutomationSchedule } from "@/lib/automations/types";

/** Cancel a queued/retry job. Running jobs are marked cancelled at next step boundary. */
export async function cancelWorkJob(jobId: string): Promise<boolean> {
  const store = getWorkQueueStore();
  const job = await store.getJob(jobId);
  if (!job) return false;
  if (
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "failed" ||
    job.status === "dead_letter"
  ) {
    return false;
  }

  const now = new Date().toISOString();
  for (const step of job.steps) {
    if (step.status === "pending" || step.status === "running") {
      await store.updateStep({
        ...step,
        status: "cancelled",
        completedAt: now,
        updatedAt: now,
        errorCode: "user_cancelled",
        errorMessage: "cancelled by user",
      });
    }
  }
  await store.updateJob(jobId, {
    status: "cancelled",
    completedAt: now,
    errorCode: "user_cancelled",
    leaseOwner: null,
    leaseExpiresAt: null,
    resultSummary: "キャンセルされました",
  });
  logWorkQueue({
    event: "JOB_CANCELLED",
    jobId,
    runId: job.runId,
    automationId: job.automationId,
    ownerId: job.ownerId,
  });
  return true;
}

export function resumeScheduleNextRun(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): string | null {
  return computeResumeNextRunIso(schedule, from);
}

export function skipScheduleNextRun(
  schedule: AutomationSchedule,
  currentNextRun: string | null,
): string | null {
  return computeSkipNextRunIso(schedule, currentNextRun);
}
