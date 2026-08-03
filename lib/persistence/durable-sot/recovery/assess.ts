/**
 * Recovery eligibility + side-effect assessment (no business completion rewrite).
 * Repository/data helpers only — does not invent retry math.
 */

import type { DurableJobRecord, DurableStepRecord } from "../types";

export type SideEffectAssessment = {
  artifactGenerated: boolean;
  storageSaved: boolean;
  externalActionExecuted: boolean;
  notificationSent: boolean;
  completionEvidencePresent: boolean;
  idempotencyRecordPresent: boolean;
  lastCompletedStepId: string | null;
  resumeFromStepId: string | null;
  unknownExternalState: boolean;
};

export type RecoveryAssessment = {
  recoverable: boolean;
  reason: string;
  strategy: "resume_from_step" | "manual_review" | "fail";
  fromStepId: string | null;
  sideEffects: SideEffectAssessment;
};

const NON_RECOVERABLE_CODES = new Set([
  "validation_failed",
  "user_cancelled",
  "revoked_authorization",
  "unsupported_operation",
  "evidence_corrupt",
  "non_idempotent_unknown",
]);

function stepOutputs(step: DurableStepRecord): Record<string, unknown> {
  return step.outputBindings ?? {};
}

export function assessSideEffects(input: {
  job: DurableJobRecord;
  steps: DurableStepRecord[];
  hasCompletionEvidence: boolean;
  hasIdempotencyRecord: boolean;
}): SideEffectAssessment {
  const sorted = [...input.steps].sort((a, b) => a.stepIndex - b.stepIndex);
  let lastCompletedStepId: string | null = null;
  let resumeFromStepId: string | null = null;
  let artifactGenerated = false;
  let storageSaved = false;
  let externalActionExecuted = false;
  let notificationSent = false;
  let unknownExternalState = false;

  for (const step of sorted) {
    const outputs = stepOutputs(step);
    const artifacts = Array.isArray(outputs.__artifactIds)
      ? (outputs.__artifactIds as unknown[])
      : [];
    if (step.status === "succeeded" || step.status === "skipped") {
      lastCompletedStepId = step.stepId;
      if (artifacts.length > 0 || outputs.artifactId) artifactGenerated = true;
      if (outputs.storagePath || outputs.storageSaved) storageSaved = true;
      if (outputs.externalActionId || outputs.externalActionExecuted) {
        externalActionExecuted = true;
      }
      if (outputs.notificationId || outputs.notificationSent) {
        notificationSent = true;
      }
      continue;
    }
    if (step.status === "running" || step.status === "failed") {
      resumeFromStepId = step.stepId;
      // Running external step without externalActionId → unknown side effect.
      if (
        (step.stepType.includes("notify") ||
          step.stepType.includes("gmail") ||
          step.stepType.includes("external") ||
          step.stepType.includes("upload")) &&
        !outputs.externalActionId &&
        step.status === "running"
      ) {
        unknownExternalState = true;
      }
      if (outputs.externalActionId) externalActionExecuted = true;
      if (artifacts.length > 0) artifactGenerated = true;
      break;
    }
    if (step.status === "pending" && !resumeFromStepId) {
      resumeFromStepId = step.stepId;
      break;
    }
  }

  return {
    artifactGenerated,
    storageSaved,
    externalActionExecuted,
    notificationSent,
    completionEvidencePresent: input.hasCompletionEvidence,
    idempotencyRecordPresent: input.hasIdempotencyRecord,
    lastCompletedStepId,
    resumeFromStepId,
    unknownExternalState,
  };
}

export function assessRecoveryEligibility(input: {
  job: DurableJobRecord;
  steps: DurableStepRecord[];
  hasCompletionEvidence: boolean;
  hasIdempotencyRecord: boolean;
  detectedReason: string;
}): RecoveryAssessment {
  const sideEffects = assessSideEffects(input);
  const errorCode = input.job.errorCode ?? "";

  if (input.job.status === "cancelled") {
    return {
      recoverable: false,
      reason: "user_cancelled",
      strategy: "fail",
      fromStepId: null,
      sideEffects,
    };
  }
  if (
    input.job.status === "completed" ||
    input.job.status === "dead_letter"
  ) {
    return {
      recoverable: false,
      reason: "terminal_job",
      strategy: "fail",
      fromStepId: null,
      sideEffects,
    };
  }
  if (NON_RECOVERABLE_CODES.has(errorCode)) {
    return {
      recoverable: false,
      reason: errorCode,
      strategy: "manual_review",
      fromStepId: sideEffects.resumeFromStepId,
      sideEffects,
    };
  }
  if (sideEffects.unknownExternalState && !sideEffects.idempotencyRecordPresent) {
    return {
      recoverable: false,
      reason: "non_idempotent_unknown",
      strategy: "manual_review",
      fromStepId: sideEffects.resumeFromStepId,
      sideEffects,
    };
  }
  if (
    input.detectedReason === "evidence_corrupt" ||
    errorCode === "evidence_corrupt"
  ) {
    return {
      recoverable: false,
      reason: "evidence_corrupt",
      strategy: "manual_review",
      fromStepId: null,
      sideEffects,
    };
  }

  return {
    recoverable: true,
    reason: input.detectedReason,
    strategy: "resume_from_step",
    fromStepId: sideEffects.resumeFromStepId,
    sideEffects,
  };
}

/** Find first non-completed step for resume (skips completed/succeeded). */
export function findResumeStepId(steps: DurableStepRecord[]): string | null {
  const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const step of sorted) {
    if (step.status === "succeeded" || step.status === "skipped") continue;
    return step.stepId;
  }
  return null;
}
