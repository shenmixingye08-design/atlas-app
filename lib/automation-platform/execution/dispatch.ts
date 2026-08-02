/**
 * Dispatch queued / due-retry runs into the executor.
 *
 * Persistence model (environment constraint):
 * - Runs + leases are DB-backed via atlas_user_state durable domains
 * - No separate Redis/SQS broker in this deployment
 * - Claim + lease + heartbeat + stuck reclaim provide restart/deploy safety
 */

import "server-only";

import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import {
  acquireDispatchLease,
  completeDispatchLease,
  deadLetterDispatchLease,
  heartbeatDispatchLease,
  reclaimStuckDispatchLeases,
} from "@/lib/automation-platform/execution/durable-dispatch";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  memoryClaimRun,
  memoryGetAutomation,
  memoryGetRun,
  memoryListDispatchableRuns,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import type { AutomationRun } from "@/lib/automation-platform/types";

const WORKER_ID =
  process.env.AUTOMATION_WORKER_ID?.trim() ||
  `worker_${process.pid}_${Math.random().toString(16).slice(2, 8)}`;

export type DispatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  awaiting: number;
};

function attachClaimTransition(run: AutomationRun): AutomationRun {
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
    return persistAutomationRunNow(memoryUpdateRun(updated));
  } catch {
    return run;
  }
}

export async function dispatchAutomationRuns(options?: {
  limit?: number;
  invoker?: StepInvoker;
  runIds?: string[];
  workerId?: string;
}): Promise<DispatchResult> {
  const result: DispatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    awaiting: 0,
  };

  const workerId = options?.workerId ?? WORKER_ID;

  const candidates =
    options?.runIds && options.runIds.length > 0
      ? options.runIds
          .map((id) => memoryGetRun(id))
          .filter((run): run is AutomationRun => Boolean(run))
      : memoryListDispatchableRuns(options?.limit ?? 20);

  const userIds = new Set(candidates.map((run) => run.userId));
  for (const userId of userIds) {
    await reclaimStuckDispatchLeases({ userId });
  }

  for (const candidate of candidates) {
    const claimed = memoryClaimRun(candidate.id);
    if (!claimed) continue;

    const lease = await acquireDispatchLease({
      run: claimed,
      workerId,
    });
    if (!lease) {
      // Another worker holds a valid lease — roll claim back to avoid stuck running.
      persistAutomationRunNow(
        memoryUpdateRun({
          ...claimed,
          status: candidate.status,
          updatedAt: new Date().toISOString(),
        }),
      );
      continue;
    }

    const withHistory = attachClaimTransition(claimed);
    const automation = memoryGetAutomation(withHistory.automationId);
    if (!automation) {
      const failed = persistAutomationRunNow(
        memoryUpdateRun({
          ...withHistory,
          status: "failed",
          lastErrorCode: "automation_not_found",
          lastErrorMessage: "自動化定義が見つかりません",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await deadLetterDispatchLease({
        runId: failed.id,
        userId: failed.userId,
        workerId,
        error: "automation_not_found",
      });
      result.processed += 1;
      result.failed += 1;
      notifyAutomationRunEvent({
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
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "retry_started",
      });
    } else {
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "started",
      });
    }

    await heartbeatDispatchLease({
      runId: withHistory.id,
      userId: withHistory.userId,
      workerId,
    });

    const execResult = await executeQueuedRun({
      run: withHistory,
      automation,
      invoker: options?.invoker ?? strictStepInvoker,
    });

    await completeDispatchLease({
      runId: withHistory.id,
      userId: withHistory.userId,
      workerId,
    });

    result.processed += 1;
    if (execResult.run.status === "succeeded") {
      result.succeeded += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: wasRetry ? "retry_finished" : "succeeded",
      });
    } else if (execResult.run.status === "partially_succeeded") {
      result.succeeded += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "partially_succeeded",
      });
    } else if (execResult.run.status === "failed") {
      result.failed += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "failed",
        detail: execResult.run.lastErrorMessage,
      });
    } else if (execResult.run.status === "retrying") {
      result.retrying += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "retry_started",
      });
    } else if (execResult.run.status === "needs_input") {
      result.awaiting += 1;
      notifyAutomationRunEvent({
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
