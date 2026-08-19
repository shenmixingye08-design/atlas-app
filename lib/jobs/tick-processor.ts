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
    // Hang = ambiguous (the first run may still have posted / generated).
    // Auto-retry here would re-enter executeAutomationRun and can double-post.
    // Fail closed; the user confirms before starting a new run.
    await upsertJobRecord({
      ...job,
      status: "failed",
      lastErrorCode: "hang_timeout",
      lastErrorMessage:
        "処理が長時間停止したため、自動再実行せず停止しました。結果をご確認のうえ、必要なら最初からやり直してください。",
      nextRetryAt: null,
      failedAt: new Date().toISOString(),
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

    // executeAutomationRun already emits the final user notification.
    // Do not send a second "completed" here — retry + success would look like
    // two results for the same job.
    if (runResult?.status === "failed") {
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
