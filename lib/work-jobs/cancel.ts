import "server-only";

import { applyWorkJobStageTransition } from "@/lib/work-jobs/production/transition";
import { emitJobLifecycleNotification } from "@/lib/work-jobs/production/notify";
import {
  getWorkJob,
  isWorkJobTerminalStatus,
  saveWorkJob,
  type WorkJobRecord,
} from "@/lib/work-jobs/store";

/**
 * Cancel a non-terminal work job. Illegal once completed/failed/cancelled.
 */
export async function cancelWorkJob(
  jobId: string,
  userId: string,
  reason = "ユーザーによりキャンセルされました",
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }
  if (isWorkJobTerminalStatus(existing.status) && existing.status !== "needs_input") {
    if (existing.status === "cancelled") return existing;
    if (existing.status === "completed" || existing.status === "failed") {
      throw new Error("job_already_terminal");
    }
  }

  const next = applyWorkJobStageTransition(existing, "cancelled", {
    reason,
    error: reason,
    estimatedRemainingMs: 0,
  });
  const saved = await saveWorkJob(next);
  emitJobLifecycleNotification({
    job: saved,
    event: "cancelled",
    message: reason,
  });
  return saved;
}
