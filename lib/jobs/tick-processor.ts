import "server-only";

import { automationService } from "@/lib/automations/automation-service";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import {
  markJobFailed,
  markJobRunning,
} from "@/lib/jobs/reliability";
import {
  listDueRetries,
  listStaleRunningJobs,
  upsertJobRecord,
} from "@/lib/jobs/job-store";
import { computeNextRetryAt } from "@/lib/jobs/retry-classifier";
import { notifyAutomationCompleted } from "@/lib/notifications/emitters";

export type TickReliabilityResult = {
  retriesProcessed: number;
  hangsDetected: number;
  dedupeSkips: number;
};

/** Process due retries and detect hung jobs inside automation tick. */
export async function processJobReliabilityTick(
  options: { requestOrigin?: string } = {},
): Promise<TickReliabilityResult> {
  const result: TickReliabilityResult = {
    retriesProcessed: 0,
    hangsDetected: 0,
    dedupeSkips: 0,
  };

  const stale = await listStaleRunningJobs();
  for (const job of stale) {
    result.hangsDetected += 1;
    const attemptCount = job.attemptCount + 1;
    const willRetry = attemptCount <= job.maxAttempts;
    await upsertJobRecord({
      ...job,
      status: willRetry ? "retrying" : "failed",
      attemptCount,
      lastErrorCode: "hang_timeout",
      lastErrorMessage: "処理が長時間停止していたため再試行します",
      nextRetryAt: willRetry ? computeNextRetryAt(attemptCount) : null,
      failedAt: willRetry ? null : new Date().toISOString(),
      pushStatus: "skipped",
      updatedAt: new Date().toISOString(),
    });
  }

  const due = await listDueRetries();
  for (const job of due) {
    if (!job.automationId || !job.userId) continue;

    const automation = await serverAutomationRepository.findById(job.automationId);
    if (!automation || automation.userId !== job.userId) continue;

    await markJobRunning({
      jobId: job.id,
      userId: job.userId,
      automationId: job.automationId,
      step: "orchestrate",
    });

    const runResult = await automationService.runNow(job.automationId, {
      userId: job.userId,
      requestOrigin: options.requestOrigin,
      skipIdempotencyClaim: true,
      existingJobId: job.id,
    });

    result.retriesProcessed += 1;

    if (runResult?.status === "completed") {
      notifyAutomationCompleted(job.userId, {
        automationId: job.automationId,
        name: automation.name,
      });
    } else if (runResult?.status === "failed") {
      await markJobFailed({
        jobId: job.id,
        userId: job.userId,
        error: runResult.error ?? "retry failed",
        automationId: job.automationId,
      });
    }
  }

  return result;
}
