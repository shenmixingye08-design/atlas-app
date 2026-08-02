/**
 * Recover hung / lease-expired running V2 runs back to retrying.
 */

import "server-only";

import {
  RUN_HANG_TIMEOUT_MS,
  RUN_MAX_ATTEMPTS,
} from "@/lib/automation-platform/reliability/constants";
import { recordExecutionEvent } from "@/lib/automation-platform/reliability/execution-events";
import {
  getLease,
  listExpiredLeaseRunIds,
  releaseRunLease,
} from "@/lib/automation-platform/reliability/lease-store";
import {
  recordRecovery,
  recordRetry,
} from "@/lib/automation-platform/reliability/metrics";
import { computeRetryAt } from "@/lib/automation-platform/execution/retry-policy";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  memoryListRunningRuns,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types";

export type RecoveryTickResult = {
  scanned: number;
  recovered: number;
  failedPermanent: number;
  releasedLeases: number;
};

export async function recoverStaleRunningRuns(options?: {
  nowMs?: number;
  hangTimeoutMs?: number;
}): Promise<RecoveryTickResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const hangTimeoutMs = options?.hangTimeoutMs ?? RUN_HANG_TIMEOUT_MS;
  const result: RecoveryTickResult = {
    scanned: 0,
    recovered: 0,
    failedPermanent: 0,
    releasedLeases: 0,
  };

  const expiredLeaseIds = new Set(listExpiredLeaseRunIds(nowMs));
  const running = memoryListRunningRuns();
  result.scanned = running.length;

  for (const run of running) {
    const lease = getLease(run.id);
    const heartbeatAt = lease
      ? Date.parse(lease.heartbeatAt)
      : Date.parse(run.updatedAt);
    const hung =
      !Number.isFinite(heartbeatAt) ||
      nowMs - heartbeatAt >= hangTimeoutMs ||
      expiredLeaseIds.has(run.id);

    if (!hung) continue;

    if (lease) {
      await releaseRunLease({ runId: run.id, workerId: lease.workerId });
      result.releasedLeases += 1;
    }

    const attemptCount = run.attemptCount + 1;
    const maxAttempts = Math.max(run.maxAttempts, RUN_MAX_ATTEMPTS);
    const willRetry = attemptCount < maxAttempts;
    const nextRetryAt = willRetry
      ? computeRetryAt({ attemptCount, maxAttempts, nowMs })
      : null;

    const entry = createStatusTransition({
      previousStatus: "running",
      nextStatus: willRetry ? "retrying" : "failed",
      reason: "lease_or_heartbeat_timeout_recovery",
      actor: { type: "system", component: "schedule_recovery" },
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
    });

    const updated: AutomationRun = {
      ...run,
      status: willRetry ? "retrying" : "failed",
      attemptCount,
      maxAttempts,
      nextRetryAt,
      lastErrorCode: willRetry ? "hang_timeout" : "hang_timeout_exhausted",
      lastErrorMessage: willRetry
        ? "実行が停止したため自動復旧して再試行します"
        : "実行停止が続き、再試行上限に達しました",
      retryable: willRetry,
      completedAt: willRetry ? null : new Date(nowMs).toISOString(),
      statusHistory: [...run.statusHistory, entry],
      updatedAt: entry.timestamp,
    };

    persistAutomationRunNow(memoryUpdateRun(updated));
    recordRecovery(willRetry);
    if (willRetry) recordRetry();

    recordExecutionEvent({
      runId: run.id,
      jobId: null,
      ownerId: run.userId,
      automationId: run.automationId,
      step: "recover",
      status: updated.status,
      startedAt: run.startedAt,
      endedAt: entry.timestamp,
      durationMs: run.startedAt ? nowMs - Date.parse(run.startedAt) : null,
      retryCount: attemptCount,
      errorCode: updated.lastErrorCode,
      errorMessage: updated.lastErrorMessage,
      failureClass: "timeout",
    });

    if (willRetry) result.recovered += 1;
    else result.failedPermanent += 1;
  }

  return result;
}
