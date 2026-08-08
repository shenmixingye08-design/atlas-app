/**
 * Dispatch queued / due-retry runs into the executor.
 */

import "server-only";

import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { getAutomationV2FromSot } from "@/lib/automation-platform/durable";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  dbClaimRun,
  dbGetRun,
  dbListDispatchableRuns,
} from "@/lib/automation-platform/repository/db-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types";

export type DispatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  awaiting: number;
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
}): Promise<DispatchResult> {
  const result: DispatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    awaiting: 0,
  };

  const candidates =
    options?.runIds && options.runIds.length > 0
      ? (
          await Promise.all(options.runIds.map((id) => dbGetRun(id)))
        ).filter((run): run is AutomationRun => Boolean(run))
      : await dbListDispatchableRuns(options?.limit ?? 20);

  for (const candidate of candidates) {
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

    // Executor expects queued/retrying — restore claimable previous for its transition
    // We already claimed to running; pass a synthetic queued shell by resetting status
    // only inside executor input while keeping id. Simpler: update executor to accept running.
    const execResult = await executeQueuedRun({
      run: withHistory,
      automation,
      invoker: options?.invoker ?? strictStepInvoker,
    });

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
