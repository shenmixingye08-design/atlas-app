import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { StepExecutionResult } from "@/lib/automation-platform/adapters/types";

/** Map rich adapter result → executor StepInvokeResult (backward compatible). */
export function toStepInvokeResult(result: StepExecutionResult): StepInvokeResult {
  const needsUserInput =
    result.status === "needs_configuration" || result.status === "needs_input";
  const ok = result.status === "succeeded" || result.status === "skipped";

  return {
    ok,
    summary: result.summary,
    artifacts: result.artifacts,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    needsUserInput,
    retryable: result.retryable,
    requestId: result.requestId,
    diagnosticId: result.diagnosticId,
    costUsage: result.costUsage,
    externalActionIds: result.externalActionIds,
    notificationIds: result.notificationIds,
    outputBindings: result.outputBindings,
  };
}
