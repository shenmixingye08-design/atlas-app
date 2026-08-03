/**
 * AutomationRun executor — step timeline, retry classification, no Memory rewrite.
 * Completion is decided only via evaluateRunCompletion + Completion Evidence.
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
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  buildCompletionEvidenceV2,
  evidenceSummaryLine,
  type StepEvidenceFragment,
} from "@/lib/automation-platform/execution/completion-evidence-v2";
import {
  evaluateRunCompletion,
  runCompletionUserMessage,
} from "@/lib/automation-platform/execution/run-completion";
import { getProductionStep } from "@/lib/automation-platform/execution/production-step-registry";
import { memoryUpdateRun } from "@/lib/automation-platform/repository/memory-store";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import {
  recordAutomationMemoryFailure,
  recordAutomationMemorySuccess,
} from "@/lib/memory-apply/automation";

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

function rejectFakeSuccess(result: {
  ok: boolean;
  artifacts: AutomationRun["artifacts"];
  evidence?: StepEvidenceFragment;
  stepType: string;
}): { ok: false; summary: string; errorCode: string; errorMessage: string } | null {
  if (!result.ok) return null;
  const production = getProductionStep(result.stepType);
  if (!production) {
    return {
      ok: false,
      summary: "未実装の手順です",
      errorCode: "step_not_implemented",
      errorMessage: `step_not_implemented:${result.stepType}`,
    };
  }
  if (production.evidenceRequired && !result.evidence) {
    return {
      ok: false,
      summary: "Evidenceなしの成功は禁止されています",
      errorCode: "automation_run_failed",
      errorMessage: "step_evidence_required",
    };
  }
  if (production.completionRequirements.includes("artifact_with_url")) {
    const hasUrl = result.artifacts.some(
      (item) => Boolean(item.id) && Boolean(item.url?.trim()),
    );
    if (!hasUrl) {
      return {
        ok: false,
        summary: "成果物URLなしの成功は禁止されています",
        errorCode: "run_artifact_missing",
        errorMessage: "artifact_url_required",
      };
    }
  }
  if (production.completionRequirements.includes("artifact_with_external_id")) {
    const hasExternal =
      (result.evidence?.externalActionIds?.length ?? 0) > 0 ||
      result.artifacts.some(
        (item) =>
          Boolean(item.externalId?.trim()) && item.kind !== "deliverable",
      );
    if (!hasExternal) {
      return {
        ok: false,
        summary: "外部アクションIDなしの成功は禁止されています",
        errorCode: "automation_run_failed",
        errorMessage: "external_action_id_required",
      };
    }
  }
  if (production.completionRequirements.includes("notification_id")) {
    if ((result.evidence?.notificationIds?.length ?? 0) === 0) {
      return {
        ok: false,
        summary: "通知IDなしの成功は禁止されています",
        errorCode: "run_notification_target_invalid",
        errorMessage: "notification_id_required",
      };
    }
  }
  if (
    production.completionRequirements.includes("vision_result") ||
    production.completionRequirements.includes("ocr_result")
  ) {
    const hasResult =
      (result.evidence?.externalActionIds?.length ?? 0) > 0 ||
      result.artifacts.some((item) => Boolean(item.externalId?.trim()));
    if (!hasResult) {
      return {
        ok: false,
        summary: "Vision/OCR結果なしの成功は禁止されています",
        errorCode: "automation_run_failed",
        errorMessage: "vision_ocr_result_required",
      };
    }
  }
  return null;
}

export async function executeQueuedRun(input: {
  run: AutomationRun;
  automation: AutomationV2;
  invoker?: StepInvoker;
}): Promise<ExecuteRunResult> {
  const invoker = input.invoker ?? strictStepInvoker;
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
  const evidenceFragments: StepEvidenceFragment[] = [];
  const completedStepIds: string[] = [];
  const incompleteOptionalStepIds: string[] = [];

  const steps: AutomationRunStep[] = run.steps.map((s) => ({ ...s }));

  for (let i = 0; i < steps.length; i += 1) {
    const runStep = steps[i]!;
    if (runStep.status === "succeeded" || runStep.status === "skipped") {
      if (runStep.status === "succeeded") {
        succeededCount += 1;
        completedStepIds.push(runStep.id);
        // Resume/retry: reconstruct step-scoped evidence from persisted artifacts
        // so completed steps still satisfy evaluateRunCompletion.
        const production = getProductionStep(runStep.capabilityId);
        if (production?.kind === "deliverable") {
          const arts = run.artifacts.filter((item) => item.kind === "deliverable");
          evidenceFragments.push({
            stepId: runStep.id,
            artifactIds: arts.map((item) => item.id),
            storageObjectIds: arts.map((item) => item.id),
            externalActionIds: [],
            externalUrls: arts
              .map((item) => item.url)
              .filter((url): url is string => Boolean(url)),
            notificationIds: [],
            outputSizeBytes: arts.reduce(
              (sum, item) => sum + (item.sizeBytes ?? 0),
              0,
            ),
          });
        } else if (production?.kind === "external") {
          const arts = run.artifacts.filter((item) => item.kind === "external");
          evidenceFragments.push({
            stepId: runStep.id,
            artifactIds: arts.map((item) => item.id),
            storageObjectIds: [],
            externalActionIds: arts
              .map((item) => item.externalId)
              .filter((id): id is string => Boolean(id)),
            externalUrls: arts
              .map((item) => item.url)
              .filter((url): url is string => Boolean(url)),
            notificationIds: [],
          });
        } else if (production?.kind === "notification") {
          const arts = run.artifacts.filter((item) => item.kind === "file");
          evidenceFragments.push({
            stepId: runStep.id,
            artifactIds: arts.map((item) => item.id),
            notificationIds: arts
              .map((item) => item.externalId ?? item.id)
              .filter(Boolean),
            storageObjectIds: [],
            externalActionIds: [],
            externalUrls: [],
          });
        } else if (
          production?.kind === "vision" ||
          production?.kind === "ocr"
        ) {
          const arts = run.artifacts.filter((item) =>
            Boolean(item.externalId?.trim()),
          );
          evidenceFragments.push({
            stepId: runStep.id,
            artifactIds: arts.map((item) => item.id),
            externalActionIds: arts
              .map((item) => item.externalId)
              .filter((id): id is string => Boolean(id)),
            storageObjectIds: [],
            externalUrls: [],
            notificationIds: [],
          });
        }
      }
      continue;
    }

    const def = stepById.get(runStep.id);
    if (!def || !def.enabled) {
      steps[i] = {
        ...runStep,
        status: "skipped",
        completedAt: new Date().toISOString(),
        outputSummary: !def
          ? "定義欠落のためスキップ"
          : "無効な手順のためスキップ",
      };
      if (def?.configuration.optional === true || def?.enabled === false) {
        incompleteOptionalStepIds.push(runStep.id);
      }
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
      let result = await invoker({
        step: def,
        userId: run.userId,
        automationName: input.automation.name,
        runId: run.id,
        approved: approved || !runStep.requiresApproval,
        resolvedInstruction: run.resolvedInstruction,
        memoryUsage: run.memoryUsage,
      });

      const fake = rejectFakeSuccess({
        ok: result.ok,
        artifacts: result.artifacts,
        evidence: result.evidence,
        stepType: def.type,
      });
      if (fake) {
        result = {
          ...result,
          ok: false,
          summary: fake.summary,
          errorCode: fake.errorCode,
          errorMessage: fake.errorMessage,
          artifacts: [],
          failedStage: "COMPLETION_GATE",
          retryable: false,
        };
      }

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
        if (def.configuration.optional === true) {
          incompleteOptionalStepIds.push(runStep.id);
        }
        if (input.automation.workflow.onFailure.strategy === "stop") {
          break;
        }
        continue;
      }

      succeededCount += 1;
      completedStepIds.push(runStep.id);
      if (result.evidence) {
        evidenceFragments.push({
          ...result.evidence,
          stepId: runStep.id,
          outputSizeBytes:
            result.evidence.outputSizeBytes ??
            result.artifacts.reduce(
              (sum, item) => sum + (item.sizeBytes ?? 0),
              0,
            ),
        });
      } else if (result.artifacts.length > 0) {
        const production = getProductionStep(def.type);
        const isExternal = production?.kind === "external";
        evidenceFragments.push({
          stepId: runStep.id,
          artifactIds: result.artifacts.map((item) => item.id),
          storageObjectIds: result.artifacts
            .filter((item) => item.kind === "deliverable")
            .map((item) => item.id),
          externalActionIds: isExternal
            ? result.artifacts
                .map((item) => item.externalId)
                .filter((id): id is string => Boolean(id))
            : [],
          externalUrls: result.artifacts
            .map((item) => item.url)
            .filter((url): url is string => Boolean(url)),
          notificationIds: [],
          outputSizeBytes: result.artifacts.reduce(
            (sum, item) => sum + (item.sizeBytes ?? 0),
            0,
          ),
        });
      }
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

  const retryable = isRetryableFailure({
    errorCode: lastErrorCode,
    errorMessage: lastErrorMessage,
  });
  const nextRetryAt =
    failedCount > 0 && retryable
      ? computeRetryAt({
          attemptCount: run.attemptCount,
          maxAttempts: run.maxAttempts,
        })
      : null;

  if (nextRetryAt) {
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

  const priorRetries = Math.max(0, run.attemptCount - 1);
  const lastRetryAttempt = [...run.attempts]
    .reverse()
    .find((item) => item.retryScheduledFor);
  const evidence = buildCompletionEvidenceV2({
    run,
    completedStepIds,
    fragments: evidenceFragments,
    incompleteOptionalStepIds,
    completedAt: finishedAt,
    retryCount: priorRetries,
    retryReason:
      priorRetries > 0
        ? lastErrorMessage ?? lastErrorCode ?? "retry_after_failure"
        : null,
    retryTime: lastRetryAttempt?.retryScheduledFor ?? null,
  });

  const decision = evaluateRunCompletion({
    run: { ...run, steps },
    workflowSteps: input.automation.workflow.steps,
    artifacts: run.artifacts,
    evidence,
    needsUserInput: false,
    retryScheduled: false,
  });

  // Hard gate: never persist succeeded without evidence.
  if (
    (decision.runStatus === "succeeded" ||
      decision.runStatus === "partially_succeeded") &&
    !evidence
  ) {
    run = persist({
      ...transition(run, "failed", "completion_evidence_missing"),
      retryable: false,
      nextRetryAt: null,
      completionEvidence: null,
      resultSummary: "Completion Evidenceを作成できないため完了できません",
      lastErrorCode: "automation_run_failed",
      lastErrorMessage: "completion_evidence_missing",
    });
    return { run, terminal: true };
  }

  const userMessage = runCompletionUserMessage(decision.productStatus);
  run = persist({
    ...transition(run, decision.runStatus, decision.reason),
    retryable: false,
    nextRetryAt: null,
    completionEvidence: evidence,
    resultSummary:
      decision.runStatus === "succeeded"
        ? `${userMessage}（${succeededCount} 件） ${evidence ? evidenceSummaryLine(evidence) : ""}`.trim()
        : decision.runStatus === "partially_succeeded"
          ? `${userMessage} ${evidence ? evidenceSummaryLine(evidence) : ""}`.trim()
          : lastErrorMessage ?? userMessage,
    lastErrorCode:
      decision.runStatus === "failed"
        ? lastErrorCode ?? "automation_run_failed"
        : null,
    lastErrorMessage:
      decision.runStatus === "failed"
        ? lastErrorMessage ?? decision.reason
        : null,
  });
  if (decision.runStatus === "succeeded") {
    void recordAutomationMemorySuccess({
      userId: run.userId,
      automationId: run.automationId,
      runId: run.id,
      memoryIdsUsed: run.memoryUsage.memoryIdsUsed ?? [],
      summary: run.resultSummary,
    });
  } else if (decision.runStatus === "failed") {
    void recordAutomationMemoryFailure({
      userId: run.userId,
      automationId: run.automationId,
      runId: run.id,
      errorCode: lastErrorCode,
      errorMessage: lastErrorMessage,
    });
  }

  return {
    run,
    terminal:
      decision.runStatus === "succeeded" ||
      decision.runStatus === "partially_succeeded" ||
      decision.runStatus === "failed",
  };
}
