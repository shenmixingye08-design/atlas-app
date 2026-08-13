/**
 * Phase 5 — reclaim mid-step stuck `running` runs after worker/process loss.
 *
 * Terminal-step orphans → finalizeOrphanRunningRun (existing).
 * Mid-step (step still running/pending) → reset interrupted steps, move to
 * `retrying` with nextRetryAt=now so dbClaimRun can resume without redoing
 * succeeded externals.
 */

import "server-only";

import { finalizeOrphanRunningRun } from "@/lib/automation-platform/execution/finalize-orphan-running";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import type { AutomationRun } from "@/lib/automation-platform/types/run";

const TERMINAL_STEP = new Set([
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export type StaleRunningRecovery =
  | { kind: "finalized"; run: AutomationRun }
  | { kind: "reclaimed"; run: AutomationRun }
  | { kind: "noop"; run: AutomationRun };

function resetInterruptedSteps(
  steps: AutomationRun["steps"],
): AutomationRun["steps"] {
  return steps.map((step) => {
    if (step.status === "running" || step.status === "waiting_approval") {
      return {
        ...step,
        status: "pending" as const,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        // Keep attemptCount — durable evidence of prior tries.
      };
    }
    return step;
  });
}

/**
 * Requeue a mid-step stuck run for claim/resume.
 * Succeeded steps and artifacts are preserved.
 */
export async function reclaimStaleMidStepRun(
  run: AutomationRun,
): Promise<AutomationRun | null> {
  if (run.status !== "running") return null;
  const hasOpenStep = run.steps.some(
    (step) => !TERMINAL_STEP.has(step.status),
  );
  if (!hasOpenStep) return null;

  const steps = resetInterruptedSteps(run.steps);
  const now = new Date().toISOString();
  const entry = createStatusTransition({
    previousStatus: "running",
    nextStatus: "retrying",
    reason: "reclaim_stale_mid_step",
    actor: { type: "worker", component: "reclaim_stale_running" },
    diagnosticId: run.diagnosticId || crypto.randomUUID(),
    timestamp: now,
  });

  return persistAutomationRunNow({
    ...run,
    steps,
    status: "retrying",
    nextRetryAt: now,
    failedStepId:
      steps.find((step) => step.status === "pending")?.id ?? run.failedStepId,
    statusHistory: [...run.statusHistory, entry],
    updatedAt: now,
    // Keep artifacts / partial evidence — never drop externalActionIds.
  });
}

/**
 * Heal one stale running run: finalize if steps terminal, else reclaim mid-step.
 */
export async function recoverStaleRunningRun(
  run: AutomationRun,
): Promise<StaleRunningRecovery> {
  if (run.status !== "running") {
    return { kind: "noop", run };
  }

  const finalized = await finalizeOrphanRunningRun(run);
  if (finalized) {
    return { kind: "finalized", run: finalized };
  }

  const reclaimed = await reclaimStaleMidStepRun(run);
  if (reclaimed) {
    return { kind: "reclaimed", run: reclaimed };
  }

  return { kind: "noop", run };
}
