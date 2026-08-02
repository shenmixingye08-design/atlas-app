/**
 * Reclaim stuck "running" runs after worker crash / process restart.
 * Moves them to retrying so dispatch can resume from failed/incomplete steps
 * without losing succeeded step state or artifacts.
 */

import "server-only";

import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  memoryListAllRuns,
  memoryListRunsForUser,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types/run";

/** Default: 15 minutes without update while running = stuck. */
export const DEFAULT_STUCK_RUNNING_MS = 15 * 60 * 1000;

export type ReclaimStuckRunsResult = {
  scanned: number;
  reclaimed: number;
  runIds: string[];
};

function listCandidateRuns(userIds?: string[]): AutomationRun[] {
  if (userIds && userIds.length > 0) {
    return userIds.flatMap((userId) => memoryListRunsForUser(userId));
  }
  return memoryListAllRuns();
}

/**
 * Find runs stuck in `running` longer than threshold and move to `retrying`.
 * Succeeded steps and artifacts are preserved on the same run.
 */
export function reclaimStuckRunningRuns(options?: {
  olderThanMs?: number;
  nowMs?: number;
  userIds?: string[];
  limit?: number;
}): ReclaimStuckRunsResult {
  const olderThanMs = options?.olderThanMs ?? DEFAULT_STUCK_RUNNING_MS;
  const nowMs = options?.nowMs ?? Date.now();
  const limit = options?.limit ?? 50;
  const candidates = listCandidateRuns(options?.userIds).filter(
    (run) => run.status === "running",
  );

  const result: ReclaimStuckRunsResult = {
    scanned: candidates.length,
    reclaimed: 0,
    runIds: [],
  };

  for (const run of candidates) {
    if (result.reclaimed >= limit) break;
    const updatedMs = Date.parse(run.updatedAt);
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs < olderThanMs) {
      continue;
    }

    try {
      const entry = createStatusTransition({
        previousStatus: "running",
        nextStatus: "retrying",
        reason: "worker_reclaim_stuck_running",
        actor: { type: "system", component: "reclaim-stuck-runs" },
        diagnosticId: run.diagnosticId || crypto.randomUUID(),
      });
      const nextRetryAt = new Date(nowMs).toISOString();
      const updated: AutomationRun = {
        ...run,
        status: "retrying",
        nextRetryAt,
        retryable: true,
        lastErrorCode: run.lastErrorCode ?? "automation_timeout",
        lastErrorMessage:
          run.lastErrorMessage ??
          "Worker再起動またはタイムアウトのため実行を再開します",
        statusHistory: [...run.statusHistory, entry],
        updatedAt: entry.timestamp,
        steps: run.steps.map((step) =>
          step.status === "running" || step.status === "retrying"
            ? {
                ...step,
                status: "failed",
                errorCode: step.errorCode ?? "automation_timeout",
                errorMessage:
                  step.errorMessage ?? "実行が中断されました（再開待ち）",
                completedAt: step.completedAt ?? entry.timestamp,
              }
            : step,
        ),
      };
      persistAutomationRunNow(memoryUpdateRun(updated));
      appendAutomationAudit({
        actorUserId: run.userId,
        action: "automation.run.reclaim",
        automationId: run.automationId,
        runId: run.id,
        outcome: "success",
        errorCode: null,
        meta: {
          requestId: run.diagnosticId || run.id,
          reason: "stuck_running",
          olderThanMs,
        },
      });
      result.reclaimed += 1;
      result.runIds.push(run.id);
    } catch {
      // Transition not allowed — skip
    }
  }

  return result;
}
