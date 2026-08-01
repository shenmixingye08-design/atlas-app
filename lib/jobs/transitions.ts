import type { JobStatus } from "@/lib/jobs/types";

/**
 * Allowed automation job status transitions.
 * Terminal states cannot resume except explicit re-queue via new idempotency key.
 */
export const JOB_ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  scheduled: ["queued", "cancelled"],
  queued: ["running", "cancelled", "failed"],
  running: [
    "retrying",
    "waiting_for_approval",
    "completed",
    "partially_completed",
    "failed",
    "cancelled",
  ],
  retrying: ["queued", "running", "failed", "cancelled"],
  waiting_for_approval: ["running", "cancelled", "failed"],
  completed: [],
  partially_completed: [],
  failed: [],
  cancelled: [],
};

export type JobTransitionRecord = {
  jobId: string;
  userId: string;
  previousStatus: JobStatus | null;
  nextStatus: JobStatus;
  changedAt: string;
  changedBy: string;
  reason: string | null;
  retryCount: number;
  failedStage: string | null;
  diagnosticId: string | null;
  requestId: string | null;
};

const historyByJob = new Map<string, JobTransitionRecord[]>();

export function isJobTransitionAllowed(
  from: JobStatus | null | undefined,
  to: JobStatus
): boolean {
  if (!from) return true;
  if (from === to) return true;
  return (JOB_ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function assertJobTransition(
  from: JobStatus | null | undefined,
  to: JobStatus,
  context?: { jobId?: string }
): void {
  if (!isJobTransitionAllowed(from, to)) {
    throw new Error(
      `invalid_state_transition:${from ?? "null"}->${to}${
        context?.jobId ? ` job=${context.jobId}` : ""
      }`
    );
  }
}

export function recordJobTransition(
  entry: JobTransitionRecord
): JobTransitionRecord {
  const list = historyByJob.get(entry.jobId) ?? [];
  list.push(entry);
  historyByJob.set(entry.jobId, list);
  return entry;
}

export function getJobTransitionHistory(jobId: string): JobTransitionRecord[] {
  return [...(historyByJob.get(jobId) ?? [])];
}

export function resetJobTransitionHistoryForTests(): void {
  historyByJob.clear();
}

export function listAllJobTransitionHistories(): Record<
  string,
  JobTransitionRecord[]
> {
  return Object.fromEntries(
    [...historyByJob.entries()].map(([k, v]) => [k, [...v]])
  );
}
