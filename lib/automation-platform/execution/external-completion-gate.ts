/**
 * External Completion Gate — external steps may complete only with provider truth.
 */

import type { AutomationV2CompletionEvidence } from "@/lib/automation-platform/execution/completion-evidence-v2";
import type {
  AutomationRun,
  AutomationRunStep,
} from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { getProductionStep } from "@/lib/automation-platform/execution/production-step-registry";

const URL_REQUIRED_STEP_TYPES = new Set([
  "google_drive",
  "dropbox",
  "wordpress",
  "google_calendar",
]);

export type ExternalCompletionGateResult = {
  ok: boolean;
  reasons: string[];
};

function isExternalProductionStep(stepType: string): boolean {
  const def = getProductionStep(stepType);
  if (!def?.requiredAdapter) return false;
  return def.requireLiveAdapterAtActivation === true;
}

function workflowStepForRunStep(
  runStep: AutomationRunStep,
  workflowSteps: ReadonlyArray<AutomationWorkflowStep>,
): AutomationWorkflowStep | undefined {
  return (
    workflowSteps.find((item) => item.id === runStep.id) ??
    workflowSteps.find((item) => item.type === runStep.capabilityId)
  );
}

/**
 * Gate for runs that include external Production Live steps.
 * Returns ok=false when any required external completion condition is missing.
 */
export function evaluateExternalCompletionGate(input: {
  run: AutomationRun;
  workflowSteps: ReadonlyArray<AutomationWorkflowStep>;
  evidence: AutomationV2CompletionEvidence | null;
}): ExternalCompletionGateResult {
  const reasons: string[] = [];
  const externalWorkflowSteps = input.workflowSteps.filter(
    (step) => step.enabled && isExternalProductionStep(step.type),
  );

  if (externalWorkflowSteps.length === 0) {
    return { ok: true, reasons: [] };
  }

  if (!input.evidence) {
    return { ok: false, reasons: ["completion_evidence_missing"] };
  }

  const requiredExternalRunSteps = input.run.steps.filter((runStep) => {
    const def = workflowStepForRunStep(runStep, input.workflowSteps);
    return Boolean(
      def && def.enabled && isExternalProductionStep(def.type),
    );
  });

  for (const step of requiredExternalRunSteps) {
    const def = workflowStepForRunStep(step, input.workflowSteps);
    const optional = def?.configuration.optional === true;
    if (optional) continue;
    if (step.status !== "succeeded" && step.status !== "skipped") {
      reasons.push(`external_step_incomplete:${step.id}:${step.status}`);
    }
  }

  if (
    requiredExternalRunSteps.some((step) => step.status === "waiting_approval")
  ) {
    reasons.push("waiting_approval_present");
  }
  if (requiredExternalRunSteps.some((step) => step.status === "retrying")) {
    reasons.push("retrying_present");
  }
  if (
    requiredExternalRunSteps.some((step) => {
      const def = workflowStepForRunStep(step, input.workflowSteps);
      return step.status === "failed" && def?.configuration.optional !== true;
    })
  ) {
    reasons.push("required_external_step_failed");
  }

  if (input.evidence.externalActionIds.length === 0) {
    reasons.push("external_action_id_missing");
  }

  const urlRequiredSucceeded = requiredExternalRunSteps.some((runStep) => {
    const def = workflowStepForRunStep(runStep, input.workflowSteps);
    return (
      def &&
      URL_REQUIRED_STEP_TYPES.has(def.type) &&
      runStep.status === "succeeded"
    );
  });
  if (urlRequiredSucceeded && input.evidence.externalUrls.length === 0) {
    reasons.push("external_url_missing");
  }

  // Provider-side re-fetch is represented by per-service evidence fragments.
  const hasProviderEvidence =
    (input.evidence.driveResults?.length ?? 0) > 0 ||
    (input.evidence.gmailResults?.length ?? 0) > 0 ||
    (input.evidence.calendarResults?.length ?? 0) > 0 ||
    (input.evidence.dropboxResults?.length ?? 0) > 0 ||
    (input.evidence.wordpressResults?.length ?? 0) > 0;

  if (!hasProviderEvidence) {
    reasons.push("provider_verification_evidence_missing");
  }

  if (!input.evidence.completionHash.trim()) {
    reasons.push("completion_hash_missing");
  }

  return { ok: reasons.length === 0, reasons };
}
