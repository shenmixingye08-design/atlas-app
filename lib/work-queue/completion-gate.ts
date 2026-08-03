import type { WorkJobRecord, WorkStepRecord } from "./types";

/**
 * Fail-closed completion for work-queue jobs.
 * `completed` requires every step finished successfully with evidence —
 * never mark completed on partial success.
 */
export type CompletionGateResult =
  | { ok: true; summary: string }
  | { ok: false; errorCode: string; errorMessage: string };

function stepHasEvidence(step: WorkStepRecord): boolean {
  switch (step.stepType) {
    case "generate_deliverable":
    case "fixture_work":
      return (
        step.artifactIds.length > 0 ||
        typeof step.outputBindings.artifactId === "string" ||
        typeof step.outputBindings.artifactPath === "string"
      );
    case "upload_storage":
      return (
        step.outputBindings.uploaded === true ||
        typeof step.outputBindings.storageReceipt === "string"
      );
    case "notify_complete":
      return (
        step.outputBindings.notified === true ||
        typeof step.outputBindings.notifyReceipt === "string" ||
        typeof step.outputBindings.notificationId === "string"
      );
    case "run_automation":
      return (
        typeof step.outputBindings.workflowRunId === "string" ||
        step.outputBindings.status === "completed"
      );
    default:
      return false;
  }
}

export function evaluateWorkQueueCompletion(
  job: WorkJobRecord,
): CompletionGateResult {
  if (job.steps.length === 0) {
    return {
      ok: false,
      errorCode: "validation_failure",
      errorMessage: "no steps — cannot complete",
    };
  }

  for (const step of job.steps) {
    if (step.status === "skipped") continue;
    if (step.status !== "completed") {
      return {
        ok: false,
        errorCode: "incomplete_steps",
        errorMessage: `step ${step.stepId} is ${step.status}, not completed`,
      };
    }
    if (!stepHasEvidence(step)) {
      return {
        ok: false,
        errorCode: "missing_evidence",
        errorMessage: `step ${step.stepId} completed without evidence`,
      };
    }
  }

  return { ok: true, summary: "仕事が完了しました（全ステップ証拠あり）" };
}
