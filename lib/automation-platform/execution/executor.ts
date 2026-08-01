/**
 * AutomationRun executor — step timeline, retry classification, no Memory rewrite.
 */

import "server-only";

import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type {
  AutomationRun,
  AutomationRunAttempt,
  AutomationRunStep,
} from "@/lib/automation-platform/types/run";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import {
  classifyExecutionError,
  computeRetryAt,
  isRetryableFailure,
} from "@/lib/automation-platform/execution/retry-policy";
import {
  defaultStepInvoker,
  type StepInvoker,
} from "@/lib/automation-platform/execution/step-invoker";
import { memoryUpdateRun } from "@/lib/automation-platform/repository/memory-store";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";

export type ExecuteRunResult = {
  run: AutomationRun;
  terminal: boolean;
};

function persist(run: AutomationRun): AutomationRun {
  const saved = memoryUpdateRun(run);
  persistAutomationRunNow(saved);
  return saved;
}

function transition(
  run: AutomationRun,
  nextStatus: AutomationRun["status"],
  reason: string,
  actor: { type: "worker"; component: string } = {
    type: "worker",
    component: "executor",
  },
): AutomationRun {
  const entry = createStatusTransition({
    previousStatus: run.status,
    nextStatus,
    reason,
    actor,
    diagnosticId: run.diagnosticId || crypto.randomUUID(),
  });
  return {
    ...run,
    status: nextStatus,
    statusHistory: [...run.statusHistory, entry],
    updatedAt: entry.timestamp,
    startedAt:
      nextStatus === "running"
        ? run.startedAt ?? entry.timestamp
        : run.startedAt,
    completedAt: [
      "succeeded",
      "partially_succeeded",
      "failed",
      "skipped",
      "cancelled",
      "expired",
    ].includes(nextStatus)
      ? entry.timestamp
      : run.completedAt,
    durationMs:
      ["succeeded", "partially_succeeded", "failed"].includes(nextStatus) &&
      (run.startedAt ?? entry.timestamp)
        ? Date.parse(entry.timestamp) -
          Date.parse(run.startedAt ?? entry.timestamp)
        : run.durationMs,
  };
}

export async function executeQueuedRun(input: {
  run: AutomationRun;
  automation: AutomationV2;
  invoker?: StepInvoker;
}): Promise<ExecuteRunResult> {
  const invoker = input.invoker ?? defaultStepInvoker;
  let run = input.run;

  // Accept pre-claimed (running) or unclaimed (queued/retrying) runs.
  if (
    run.status !== "queued" &&
    run.status !== "retrying" &&
    run.status !== "running"
  ) {
    return { run, terminal: false };
  }

  if (run.status === "queued" || run.status === "retrying") {
    run = persist(transition(run, "running", "claim_and_start"));
  }

  const attempt: AutomationRunAttempt = {
    attempt: run.attemptCount + 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    retryScheduledFor: null,
  };
  run = persist({
    ...run,
    attemptCount: attempt.attempt,
    attempts: [...run.attempts, attempt],
    nextRetryAt: null,
  });

  const approved =
    run.approval?.status === "approved" ||
    run.approval?.status === "not_required";

  const stepById = new Map(
    input.automation.workflow.steps.map((step) => [step.id, step]),
  );

  let failedStepId: string | null = null;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;
  let needsUserInput = false;
  let succeededCount = 0;
  let failedCount = 0;

  const steps: AutomationRunStep[] = run.steps.map((s) => ({ ...s }));

  for (let i = 0; i < steps.length; i += 1) {
    const runStep = steps[i]!;
    if (runStep.status === "succeeded" || runStep.status === "skipped") {
      if (runStep.status === "succeeded") succeededCount += 1;
      continue;
    }

    const def = stepById.get(runStep.id);
    if (!def || !def.enabled) {
      steps[i] = {
        ...runStep,
        status: "skipped",
        completedAt: new Date().toISOString(),
        outputSummary: "無効な手順のためスキップ",
      };
      continue;
    }

    const now = new Date().toISOString();
    steps[i] = {
      ...runStep,
      status: "running",
      startedAt: now,
      attemptCount: runStep.attemptCount + 1,
    };
    run = persist({ ...run, steps: steps.map((s) => ({ ...s })) });

    try {
      const result = await invoker({
        step: def,
        userId: run.userId,
        automationName: input.automation.name,
        runId: run.id,
        approved: approved || !runStep.requiresApproval,
      });

      if (result.needsUserInput) {
        needsUserInput = true;
        steps[i] = {
          ...steps[i]!,
          status: "waiting_approval",
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          outputSummary: result.summary,
        };
        failedStepId = runStep.id;
        lastErrorCode = result.errorCode ?? "automation_approval_required";
        lastErrorMessage = result.errorMessage ?? result.summary;
        break;
      }

      if (!result.ok) {
        failedCount += 1;
        failedStepId = runStep.id;
        lastErrorCode = result.errorCode ?? "automation_run_failed";
        lastErrorMessage = result.errorMessage ?? result.summary;
        steps[i] = {
          ...steps[i]!,
          status: "failed",
          completedAt: new Date().toISOString(),
          errorCode: lastErrorCode,
          errorMessage: lastErrorMessage,
          outputSummary: result.summary,
        };
        if (input.automation.workflow.onFailure.strategy === "stop") {
          break;
        }
        continue;
      }

      succeededCount += 1;
      steps[i] = {
        ...steps[i]!,
        status: "succeeded",
        completedAt: new Date().toISOString(),
        outputSummary: result.summary,
        errorCode: null,
        errorMessage: null,
      };
      run = persist({
        ...run,
        steps: steps.map((s) => ({ ...s })),
        artifacts: [...run.artifacts, ...result.artifacts],
      });
    } catch (error) {
      const classified = classifyExecutionError(error);
      failedCount += 1;
      failedStepId = runStep.id;
      lastErrorCode = classified.code;
      lastErrorMessage = classified.message;
      steps[i] = {
        ...steps[i]!,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorCode: classified.code,
        errorMessage: classified.message,
        outputSummary: "手順で例外が発生しました",
      };
      if (input.automation.workflow.onFailure.strategy === "stop") {
        break;
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const attempts = run.attempts.map((item, index) =>
    index === run.attempts.length - 1
      ? {
          ...item,
          finishedAt,
          errorCode: lastErrorCode,
          errorMessage: lastErrorMessage,
        }
      : item,
  );

  run = {
    ...run,
    steps,
    attempts,
    failedStepId,
    lastErrorCode,
    lastErrorMessage,
    needsUserInput,
    // Memory must never be rewritten by executor
    memoryUsage: {
      ...run.memoryUsage,
      updated: [],
    },
    updatedAt: finishedAt,
  };

  if (needsUserInput) {
    run = persist(transition(run, "needs_input", "step_needs_input"));
    return { run, terminal: false };
  }

  if (failedCount === 0) {
    run = persist({
      ...transition(run, "succeeded", "all_steps_succeeded"),
      resultSummary: `${succeededCount} 件の手順が完了しました`,
      retryable: false,
    });
    return { run, terminal: true };
  }

  const retryable = isRetryableFailure({
    errorCode: lastErrorCode,
    errorMessage: lastErrorMessage,
  });
  const nextRetryAt = retryable
    ? computeRetryAt({
        attemptCount: run.attemptCount,
        maxAttempts: run.maxAttempts,
      })
    : null;

  if (retryable && nextRetryAt) {
    const withRetry = {
      ...transition(run, "retrying", "retry_scheduled"),
      nextRetryAt,
      retryable: true,
      resultSummary: `失敗のため再試行予定: ${nextRetryAt}`,
      attempts: attempts.map((item, index) =>
        index === attempts.length - 1
          ? { ...item, retryScheduledFor: nextRetryAt }
          : item,
      ),
    };
    run = persist(withRetry);
    return { run, terminal: false };
  }

  const terminalStatus =
    succeededCount > 0 ? "partially_succeeded" : "failed";
  run = persist({
    ...transition(run, terminalStatus, "execution_failed"),
    retryable: false,
    nextRetryAt: null,
    resultSummary:
      terminalStatus === "partially_succeeded"
        ? `${succeededCount} 件成功 / ${failedCount} 件失敗`
        : lastErrorMessage ?? "実行に失敗しました",
  });
  return { run, terminal: true };
}
