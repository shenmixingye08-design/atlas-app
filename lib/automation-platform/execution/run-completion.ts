/**
 * Unified V2 run completion evaluation.
 * Only real completed work (artifacts / external ids / evidence) may become succeeded.
 *
 * Status mapping (V2 enum ↔ product language):
 * - succeeded           = completed（仕事が完了しました）
 * - partially_succeeded = partially_completed（一部完了・確認必要）
 * - failed              = failed
 */

import type {
  AutomationRun,
  AutomationRunArtifact,
  AutomationRunStep,
} from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";
import {
  getProductionStep,
  type ProductionCompletionRequirement,
} from "@/lib/automation-platform/execution/production-step-registry";
import type { AutomationV2CompletionEvidence } from "@/lib/automation-platform/execution/completion-evidence-v2";

export type RunCompletionDecision = {
  /** Product-facing label */
  productStatus:
    | "completed"
    | "partially_completed"
    | "failed"
    | "waiting"
    | "retrying";
  /** Persisted AutomationRun status */
  runStatus: Extract<
    AutomationRunStatus,
    "succeeded" | "partially_succeeded" | "failed" | "needs_input" | "retrying"
  >;
  reason: string;
  incompleteRequiredStepIds: string[];
  missingEvidence: string[];
};

function isOptionalStep(def: AutomationWorkflowStep | undefined): boolean {
  if (!def) return false;
  return def.configuration.optional === true;
}

function artifactsForStep(
  step: AutomationRunStep,
  artifacts: AutomationRunArtifact[],
  evidence: AutomationV2CompletionEvidence | null,
): AutomationRunArtifact[] {
  if (!evidence) return artifacts;
  // Prefer evidence-linked artifacts; fall back to full run pool.
  const linked = artifacts.filter((item) =>
    evidence.artifactIds.includes(item.id),
  );
  return linked.length > 0 ? linked : artifacts;
}

function requirementMet(
  requirement: ProductionCompletionRequirement,
  input: {
    artifacts: AutomationRunArtifact[];
    evidence: AutomationV2CompletionEvidence | null;
    step: AutomationRunStep;
  },
): boolean {
  const pool = artifactsForStep(input.step, input.artifacts, input.evidence);
  switch (requirement) {
    case "artifact_with_url":
      return pool.some(
        (item) =>
          Boolean(item.id) &&
          Boolean(item.url?.trim()) &&
          (item.kind === "deliverable" || item.kind === "file"),
      );
    case "artifact_with_external_id":
      return (
        pool.some((item) => Boolean(item.externalId?.trim())) ||
        (input.evidence?.externalActionIds.length ?? 0) > 0
      );
    case "notification_id":
      return (input.evidence?.notificationIds.length ?? 0) > 0;
    case "vision_result":
    case "ocr_result":
      return pool.some(
        (item) => Boolean(item.id) && Boolean(item.externalId?.trim()),
      );
    case "control_pass":
      return input.step.status === "succeeded";
    default:
      return false;
  }
}

/**
 * Single source of truth for whether a V2 run may be marked completed.
 */
export function evaluateRunCompletion(input: {
  run: AutomationRun;
  workflowSteps: AutomationWorkflowStep[];
  artifacts: AutomationRunArtifact[];
  evidence: AutomationV2CompletionEvidence | null;
  needsUserInput: boolean;
  retryScheduled: boolean;
}): RunCompletionDecision {
  if (input.run.status === "cancelled") {
    return {
      productStatus: "failed",
      runStatus: "failed",
      reason: "cancelled_run_cannot_complete",
      incompleteRequiredStepIds: [],
      missingEvidence: ["cancelled"],
    };
  }

  if (input.needsUserInput) {
    return {
      productStatus: "waiting",
      runStatus: "needs_input",
      reason: "waiting_for_user",
      incompleteRequiredStepIds: input.run.failedStepId
        ? [input.run.failedStepId]
        : [],
      missingEvidence: [],
    };
  }

  if (input.retryScheduled) {
    return {
      productStatus: "retrying",
      runStatus: "retrying",
      reason: "retry_scheduled",
      incompleteRequiredStepIds: input.run.failedStepId
        ? [input.run.failedStepId]
        : [],
      missingEvidence: [],
    };
  }

  const defById = new Map(input.workflowSteps.map((step) => [step.id, step]));
  const incompleteRequired: string[] = [];
  const missingEvidence: string[] = [];
  let optionalFailures = 0;
  let requiredComplete = 0;
  let requiredTotal = 0;

  for (const step of input.run.steps) {
    const def = defById.get(step.id);
    const optional = isOptionalStep(def);

    // Definition disabled → skipped_optional (does not block completion).
    if (step.status === "skipped" && def?.enabled === false) {
      continue;
    }

    if (!optional) {
      requiredTotal += 1;
    }

    if (
      step.status === "pending" ||
      step.status === "running" ||
      step.status === "retrying" ||
      step.status === "waiting_approval"
    ) {
      if (!optional) {
        incompleteRequired.push(step.id);
        missingEvidence.push(`unresolved:${step.id}:${step.status}`);
      } else {
        optionalFailures += 1;
      }
      continue;
    }

    if (step.status === "skipped") {
      // Required enabled step skipped → fail closed.
      if (!optional) {
        incompleteRequired.push(step.id);
        missingEvidence.push(`required_skipped:${step.id}`);
      } else {
        optionalFailures += 1;
      }
      continue;
    }

    if (step.status === "failed") {
      if (optional) {
        optionalFailures += 1;
      } else {
        incompleteRequired.push(step.id);
        missingEvidence.push(`failed:${step.id}`);
      }
      continue;
    }

    if (step.status !== "succeeded") {
      if (!optional) {
        incompleteRequired.push(step.id);
        missingEvidence.push(`bad_status:${step.id}:${step.status}`);
      } else {
        optionalFailures += 1;
      }
      continue;
    }

    const production = getProductionStep(step.capabilityId);
    if (!production) {
      incompleteRequired.push(step.id);
      missingEvidence.push(`unregistered_success:${step.capabilityId}`);
      continue;
    }

    let stepOk = true;
    for (const requirement of production.completionRequirements) {
      if (
        !requirementMet(requirement, {
          artifacts: input.artifacts,
          evidence: input.evidence,
          step,
        })
      ) {
        stepOk = false;
        missingEvidence.push(`${requirement}:${step.id}`);
      }
    }

    if (!stepOk) {
      if (optional) {
        optionalFailures += 1;
      } else {
        incompleteRequired.push(step.id);
      }
      continue;
    }

    if (!optional) {
      requiredComplete += 1;
    }
  }

  if (incompleteRequired.length > 0) {
    return {
      productStatus: "failed",
      runStatus: "failed",
      reason: "required_steps_incomplete",
      incompleteRequiredStepIds: [...new Set(incompleteRequired)],
      missingEvidence,
    };
  }

  if (!input.evidence) {
    return {
      productStatus: "failed",
      runStatus: "failed",
      reason: "completion_evidence_missing",
      incompleteRequiredStepIds: [],
      missingEvidence: ["evidence"],
    };
  }

  if (requiredTotal > 0 && requiredComplete < requiredTotal) {
    return {
      productStatus: "failed",
      runStatus: "failed",
      reason: "required_steps_incomplete",
      incompleteRequiredStepIds: [],
      missingEvidence,
    };
  }

  if (optionalFailures > 0) {
    return {
      productStatus: "partially_completed",
      runStatus: "partially_succeeded",
      reason: "optional_steps_incomplete",
      incompleteRequiredStepIds: [],
      missingEvidence,
    };
  }

  return {
    productStatus: "completed",
    runStatus: "succeeded",
    reason: "all_required_steps_completed_with_evidence",
    incompleteRequiredStepIds: [],
    missingEvidence: [],
  };
}

/** User-facing copy for run product status. */
export function runCompletionUserMessage(
  productStatus: RunCompletionDecision["productStatus"],
): string {
  switch (productStatus) {
    case "completed":
      return "仕事が完了しました";
    case "partially_completed":
      return "一部完了しました。確認が必要です";
    case "waiting":
      return "確認待ちです";
    case "retrying":
      return "再試行の準備中です";
    case "failed":
    default:
      return "完了できませんでした";
  }
}
