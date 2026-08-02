/**
 * Lease-aware dispatch: claim run + acquire lease, heartbeat during execute, release.
 */

import "server-only";

import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { classifyFailure } from "@/lib/automation-platform/reliability/failure-class";
import { recordExecutionEvent } from "@/lib/automation-platform/reliability/execution-events";
import {
  acquireRunLease,
  heartbeatRunLease,
  releaseRunLease,
} from "@/lib/automation-platform/reliability/lease-store";
import {
  recordClaim,
  recordDuplicate,
  recordRunDuration,
  recordWorkerActivity,
} from "@/lib/automation-platform/reliability/metrics";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  memoryClaimRun,
  memoryGetAutomation,
  memoryGetRun,
  memoryListDispatchableRuns,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types";
import { RUN_HEARTBEAT_INTERVAL_MS } from "@/lib/automation-platform/reliability/constants";

export type LeasedDispatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  awaiting: number;
  leaseConflicts: number;
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
      reason: "leased_dispatch_claim",
      actor: { type: "worker", component: "leased_dispatch" },
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
    });
    return persistAutomationRunNow(
      memoryUpdateRun({
        ...run,
        statusHistory: [...run.statusHistory, entry],
        updatedAt: entry.timestamp,
      }),
    );
  } catch {
    return run;
  }
}

export async function dispatchAutomationRunsWithLease(options?: {
  limit?: number;
  invoker?: StepInvoker;
  runIds?: string[];
  requestOrigin?: string | null;
  workerId?: string;
}): Promise<LeasedDispatchResult> {
  const workerId = options?.workerId ?? `worker_${crypto.randomUUID().slice(0, 8)}`;
  const result: LeasedDispatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    awaiting: 0,
    leaseConflicts: 0,
  };

  const candidates =
    options?.runIds && options.runIds.length > 0
      ? options.runIds
          .map((id) => memoryGetRun(id))
          .filter((run): run is AutomationRun => Boolean(run))
      : memoryListDispatchableRuns(options?.limit ?? 50);

  for (const candidate of candidates) {
    recordClaim();
    const lease = await acquireRunLease({
      runId: candidate.id,
      ownerId: candidate.userId,
      automationId: candidate.automationId,
      workerId,
    });
    if (!lease) {
      result.leaseConflicts += 1;
      recordDuplicate();
      continue;
    }

    const claimed = memoryClaimRun(candidate.id);
    if (!claimed) {
      // Already claimed in-process — release lease
      await releaseRunLease({ runId: candidate.id, workerId });
      result.leaseConflicts += 1;
      recordDuplicate();
      continue;
    }

    const withHistory = attachClaimTransition(claimed);
    recordExecutionEvent({
      runId: withHistory.id,
      jobId: null,
      ownerId: withHistory.userId,
      automationId: withHistory.automationId,
      step: "claim",
      status: "running",
      startedAt: withHistory.startedAt,
      endedAt: null,
      durationMs: null,
      retryCount: withHistory.attemptCount,
      errorCode: null,
      errorMessage: null,
      failureClass: null,
      meta: { workerId, leaseToken: lease.token },
    });

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
      await releaseRunLease({ runId: failed.id, workerId });
      result.processed += 1;
      result.failed += 1;
      recordRunDuration({
        durationMs: 0,
        ok: false,
        failureClass: "validation",
      });
      continue;
    }

    const wasRetry = candidate.status === "retrying";
    notifyAutomationRunEvent({
      userId: automation.userId,
      automationName: automation.name,
      run: withHistory,
      policy: automation.notificationPolicy,
      event: wasRetry ? "retry_started" : "started",
    });

    const heartbeatTimer = setInterval(() => {
      void heartbeatRunLease({
        runId: withHistory.id,
        workerId,
        token: lease.token,
      }).then(() => {
        recordWorkerActivity();
        recordExecutionEvent({
          runId: withHistory.id,
          jobId: null,
          ownerId: withHistory.userId,
          automationId: withHistory.automationId,
          step: "heartbeat",
          status: "running",
          startedAt: withHistory.startedAt,
          endedAt: null,
          durationMs: null,
          retryCount: withHistory.attemptCount,
          errorCode: null,
          errorMessage: null,
          failureClass: null,
        });
      });
    }, RUN_HEARTBEAT_INTERVAL_MS);

    let execResult: Awaited<ReturnType<typeof executeQueuedRun>>;
    try {
      execResult = await executeQueuedRun({
        run: withHistory,
        automation,
        invoker: options?.invoker ?? strictStepInvoker,
        requestOrigin: options?.requestOrigin,
      });
    } finally {
      clearInterval(heartbeatTimer);
      await releaseRunLease({ runId: withHistory.id, workerId });
    }

    result.processed += 1;
    const durationMs =
      execResult.run.durationMs ??
      (execResult.run.startedAt
        ? Date.now() - Date.parse(execResult.run.startedAt)
        : 0);

    if (execResult.run.status === "succeeded") {
      result.succeeded += 1;
      recordRunDuration({ durationMs, ok: true });
      recordExecutionEvent({
        runId: execResult.run.id,
        jobId: null,
        ownerId: execResult.run.userId,
        automationId: execResult.run.automationId,
        step: "complete",
        status: "succeeded",
        startedAt: execResult.run.startedAt,
        endedAt: execResult.run.completedAt,
        durationMs,
        retryCount: execResult.run.attemptCount,
        errorCode: null,
        errorMessage: null,
        failureClass: null,
      });
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: wasRetry ? "retry_finished" : "succeeded",
      });
    } else if (execResult.run.status === "partially_succeeded") {
      result.succeeded += 1;
      recordRunDuration({ durationMs, ok: true });
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "partially_succeeded",
      });
    } else if (execResult.run.status === "failed") {
      result.failed += 1;
      const classified = classifyFailure({
        errorCode: execResult.run.lastErrorCode,
        errorMessage: execResult.run.lastErrorMessage,
      });
      recordRunDuration({
        durationMs,
        ok: false,
        failureClass: classified.failureClass,
      });
      recordExecutionEvent({
        runId: execResult.run.id,
        jobId: null,
        ownerId: execResult.run.userId,
        automationId: execResult.run.automationId,
        step: "fail",
        status: "failed",
        startedAt: execResult.run.startedAt,
        endedAt: execResult.run.completedAt,
        durationMs,
        retryCount: execResult.run.attemptCount,
        errorCode: execResult.run.lastErrorCode,
        errorMessage: execResult.run.lastErrorMessage,
        failureClass: classified.failureClass,
      });
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
      recordExecutionEvent({
        runId: execResult.run.id,
        jobId: null,
        ownerId: execResult.run.userId,
        automationId: execResult.run.automationId,
        step: "retry",
        status: "retrying",
        startedAt: execResult.run.startedAt,
        endedAt: null,
        durationMs,
        retryCount: execResult.run.attemptCount,
        errorCode: execResult.run.lastErrorCode,
        errorMessage: execResult.run.lastErrorMessage,
        failureClass: classifyFailure({
          errorCode: execResult.run.lastErrorCode,
          errorMessage: execResult.run.lastErrorMessage,
        }).failureClass,
      });
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
