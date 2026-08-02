import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

function toArtifact(
  label: string,
  result: LiveAdapterResult,
): AutomationRunArtifact {
  return {
    id: crypto.randomUUID(),
    kind: "external",
    label,
    url: result.url,
    externalId: result.externalId,
    createdAt: new Date().toISOString(),
  };
}

/** Map LiveAdapterResult → StepInvokeResult for the strict invoker. */
export function liveAdapterToStepResult(
  label: string,
  result: LiveAdapterResult,
): StepInvokeResult {
  if (result.skippedDuplicate) {
    return {
      ok: false,
      summary: result.summary || "重複処理を防止しました",
      artifacts: [],
      errorCode: result.errorCode ?? "automation_duplicate_prevented",
      errorMessage: result.errorMessage ?? result.summary,
      needsUserInput: false,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      summary: result.summary,
      artifacts: [],
      errorCode:
        result.errorCode ??
        (result.needsReconnect
          ? "automation_integration_required"
          : "automation_step_failed"),
      errorMessage: result.errorMessage ?? result.summary,
      needsUserInput: result.needsReconnect,
    };
  }

  return {
    ok: true,
    summary: result.summary,
    artifacts: [toArtifact(label, result)],
  };
}
