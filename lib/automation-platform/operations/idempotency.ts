import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationRunStep } from "@/lib/automation-platform/types/run";

/** Capabilities that perform irreversible or externally-visible side effects. */
export const EXTERNAL_ACTION_CAPABILITIES: ReadonlySet<AutomationCapabilityId> =
  new Set([
    "gmail",
    "x_post",
    "google_calendar",
    "wordpress",
    "dropbox",
    "notify",
  ]);

export function isExternalActionCapability(
  capabilityId: AutomationCapabilityId,
): boolean {
  return EXTERNAL_ACTION_CAPABILITIES.has(capabilityId);
}

/**
 * Succeeded external actions must not be re-executed on retry.
 * Non-external succeeded steps may be kept as succeeded (executor skips them).
 */
export function shouldSkipOnRetry(step: AutomationRunStep): boolean {
  return (
    step.status === "succeeded" &&
    isExternalActionCapability(step.capabilityId)
  );
}

export function prepareStepsForSafeRetry(
  steps: AutomationRunStep[],
  options: {
    mode: "failed_only" | "from_failed" | "full";
    failedStepId: string | null;
  },
): AutomationRunStep[] {
  const failedIndex = options.failedStepId
    ? steps.findIndex((step) => step.id === options.failedStepId)
    : -1;

  return steps.map((step, index) => {
    // Keep status=succeeded for already-done externals. Remapping to "skipped"
    // made evaluateRunCompletion fail-closed (required_skipped) and left safe
    // retries unable to reach terminal succeeded after Calendar succeeded.
    // Executor already no-ops succeeded steps; side-effect claims block dupes.
    if (shouldSkipOnRetry(step)) {
      return {
        ...step,
        status: "succeeded" as const,
        outputSummary:
          step.outputSummary ??
          "既に完了した外部操作のため再実行しませんでした",
        errorCode: null,
        errorMessage: null,
      };
    }

    if (options.mode === "full") {
      if (step.status === "succeeded") {
        return { ...step };
      }
      return {
        ...step,
        status: "pending" as const,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        outputSummary: null,
        attemptCount: 0,
      };
    }

    if (options.mode === "failed_only") {
      if (step.id === options.failedStepId || step.status === "failed") {
        return {
          ...step,
          status: "pending" as const,
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          outputSummary: null,
        };
      }
      return { ...step };
    }

    // from_failed: reset failed and all subsequent non-succeeded steps
    if (failedIndex >= 0 && index >= failedIndex) {
      if (step.status === "succeeded" && !shouldSkipOnRetry(step)) {
        return { ...step };
      }
      if (shouldSkipOnRetry(step)) {
        return {
          ...step,
          status: "succeeded" as const,
          outputSummary:
            step.outputSummary ??
            "既に完了した外部操作のため再実行しませんでした",
        };
      }
      return {
        ...step,
        status: "pending" as const,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        outputSummary: null,
      };
    }

    return { ...step };
  });
}
