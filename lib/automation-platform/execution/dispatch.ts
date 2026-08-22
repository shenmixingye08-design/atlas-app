/**
 * Dispatch queued / due-retry runs into the executor.
 */

import "server-only";

import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { finalizeOrphanRunningRun } from "@/lib/automation-platform/execution/finalize-orphan-running";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import { recoverStaleRunningRun } from "@/lib/automation-platform/execution/reclaim-stale-running";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { getAutomationV2FromSot } from "@/lib/automation-platform/durable";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  dbClaimRun,
  dbGetRun,
  dbListDispatchableRuns,
  dbListStuckRunningRuns,
} from "@/lib/automation-platform/repository/db-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types";

export type DispatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  awaiting: number;
  /** Phase 5: mid-step stale runs requeued for resume */
  reclaimed: number;
  /** Due runs left unclaimed because the tick deadline was reached. */
  deferred: number;
};

async function attachClaimTransition(run: AutomationRun): Promise<AutomationRun> {
  if (run.status !== "running") return run;
  const last = run.statusHistory[run.statusHistory.length - 1];
  if (last?.nextStatus === "running") return run;
  const previousStatus = last?.nextStatus;
  const from =
    previousStatus === "retrying" || previousStatus === "queued"
      ? previousStatus
      : run.attemptCount > 0
        ? "retrying"
        : "queued";
  try {
    const entry = createStatusTransition({
      previousStatus: from,
      nextStatus: "running",
      reason: "dispatch_claim",
      actor: { type: "worker", component: "dispatch" },
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
    });
    const updated = {
      ...run,
      statusHistory: [...run.statusHistory, entry],
      updatedAt: entry.timestamp,
    };
    return persistAutomationRunNow(updated);
  } catch {
    return run;
  }
}

export async function dispatchAutomationRuns(options?: {
  limit?: number;
  invoker?: StepInvoker;
  runIds?: string[];
  signal?: AbortSignal;
  canStartJob?: () => boolean;
}): Promise<DispatchResult> {
  const result: DispatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    awaiting: 0,
    reclaimed: 0,
    deferred: 0,
  };

  const canStart = () =>
    !options?.signal?.aborted &&
    (options?.canStartJob ? options.canStartJob() : true);

  // Heal stuck running: terminal-step finalize OR mid-step reclaim → retrying.
  const reclaimedIds: string[] = [];
  if (!options?.runIds?.length && canStart()) {
    const stuck = await dbListStuckRunningRuns(options?.limit ?? 10);
    for (const orphan of stuck) {
      try {
        const recovery = await recoverStaleRunningRun(orphan);
        if (recovery.kind === "finalized") {
          result.processed += 1;
          if (recovery.run.status === "succeeded") result.succeeded += 1;
          else if (recovery.run.status === "retrying") result.retrying += 1;
          else if (recovery.run.status === "needs_input") result.awaiting += 1;
          else result.failed += 1;
        } else if (recovery.kind === "reclaimed") {
          result.reclaimed += 1;
          reclaimedIds.push(recovery.run.id);
        }
      } catch (error) {
        console.error("[automation-v2] recover stale running failed", {
          runId: orphan.id,
          message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      }
    }
  }

  const listed =
    options?.runIds && options.runIds.length > 0
      ? (
          await Promise.all(options.runIds.map((id) => dbGetRun(id)))
        ).filter((run): run is AutomationRun => Boolean(run))
      : [
          ...(await dbListDispatchableRuns(options?.limit ?? 20)),
          ...(
            await Promise.all(reclaimedIds.map((id) => dbGetRun(id)))
          ).filter((run): run is AutomationRun => Boolean(run)),
        ];
  const seen = new Set<string>();
  const candidates = listed.filter((run) => {
    if (seen.has(run.id)) return false;
    seen.add(run.id);
    return true;
  });

  for (const candidate of candidates) {
    if (!canStart()) {
      result.deferred += 1;
      continue;
    }
    const claimed = await dbClaimRun(candidate.id);
    if (!claimed) continue;

    const withHistory = await attachClaimTransition(claimed);
    const automation = await getAutomationV2FromSot(withHistory.automationId);
    if (!automation) {
      const failed = await persistAutomationRunNow({
        ...withHistory,
        status: "failed",
        lastErrorCode: "automation_not_found",
        lastErrorMessage: "自動化定義が見つかりません",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      result.processed += 1;
      result.failed += 1;
      await notifyAutomationRunEvent({
        userId: failed.userId,
        automationName: withHistory.automationName,
        run: failed,
        policy: {
          beforeRun: false,
          onSuccess: true,
          onFailure: true,
          onNeedsInput: true,
          channels: ["in_app"],
        },
        event: "failed",
      });
      continue;
    }

    const wasRetry = candidate.status === "retrying";
    if (wasRetry) {
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "retry_started",
      });
    } else {
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "started",
      });
    }

    let execResult: Awaited<ReturnType<typeof executeQueuedRun>>;
    try {
      execResult = await executeQueuedRun({
        run: withHistory,
        automation,
        invoker: options?.invoker ?? strictStepInvoker,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 300) : "executor_threw";
      const failed = await persistAutomationRunNow({
        ...withHistory,
        status: "failed",
        lastErrorCode: "automation_run_failed",
        lastErrorMessage: message,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryable: false,
        nextRetryAt: null,
        resultSummary: "実行中に例外が発生したため失敗として閉じました",
      });
      result.processed += 1;
      result.failed += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: failed,
        policy: automation.notificationPolicy,
        event: "failed",
        detail: message,
      });
      continue;
    }

    // Fail-closed: never leave a claimed run in running after executor returns.
    if (execResult.run.status === "running") {
      const finalized =
        (await finalizeOrphanRunningRun(execResult.run)) ??
        (await persistAutomationRunNow({
          ...execResult.run,
          status: "failed",
          lastErrorCode: "automation_run_failed",
          lastErrorMessage: "executor_returned_non_terminal_running",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryable: false,
          nextRetryAt: null,
          resultSummary: "実行が完了状態に到達しなかったため失敗として閉じました",
        }));
      execResult = { run: finalized, terminal: true };
    }

    result.processed += 1;
    if (execResult.run.status === "succeeded") {
      result.succeeded += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: wasRetry ? "retry_finished" : "succeeded",
      });
    } else if (execResult.run.status === "partially_succeeded") {
      // Partial completion is not a success counter / completed notification.
      result.failed += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "partially_succeeded",
      });
    } else if (execResult.run.status === "failed") {
      result.failed += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "failed",
        detail: execResult.run.lastErrorMessage,
      });
    } else if (execResult.run.status === "retrying") {
      result.retrying += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "retry_started",
      });
    } else if (execResult.run.status === "needs_input") {
      result.awaiting += 1;
      await notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "needs_input",
      });
    }
  }

  return result;
}
