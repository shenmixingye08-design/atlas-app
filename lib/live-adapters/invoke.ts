import "server-only";

import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";

import { hashContent } from "./idempotency";
import {
  assertLiveSideEffectsAllowed,
  getAdapterRegistry,
} from "./registry/resolve";
import { resolveAdapterRuntimeMode } from "./mode";
import { mapCapabilityToIntegrationService } from "./preflight";
import type { LiveExecutionResult } from "./types";

function toStepResult(
  result: LiveExecutionResult,
  label: string,
): StepInvokeResult {
  if (
    result.status === "succeeded" ||
    result.status === "duplicate_skipped"
  ) {
    const artifacts: AutomationRunArtifact[] = [
      {
        id: crypto.randomUUID(),
        kind: "file",
        label,
        url: result.externalUrl,
        externalId: result.externalActionId,
        createdAt: result.completedAt,
      },
    ];
    return {
      ok: true,
      summary: result.summary,
      artifacts,
      errorCode: null,
      errorMessage: null,
    };
  }

  return {
    ok: false,
    summary: result.summary,
    artifacts: [],
    errorCode: result.errorCode ?? "automation_integration_required",
    errorMessage: result.summary,
    needsUserInput:
      result.status === "needs_connection" ||
      result.status === "needs_permission" ||
      result.status === "needs_approval" ||
      result.status === "needs_configuration",
  };
}

/** Execute a V2 external step through the Live Adapter Registry. */
export async function invokeLiveAdapterForStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
  approved: boolean;
  automationName: string;
  artifactBuffer?: Buffer | null;
  artifactFileName?: string | null;
  artifactMimeType?: string | null;
}): Promise<StepInvokeResult> {
  const mode = resolveAdapterRuntimeMode();
  const sideEffects = assertLiveSideEffectsAllowed(mode);
  if (!sideEffects.allowed) {
    return {
      ok: false,
      summary: sideEffects.reason ?? "Live external execution disabled",
      artifacts: [],
      errorCode: "automation_feature_disabled",
      errorMessage: sideEffects.reason,
    };
  }

  const service = mapCapabilityToIntegrationService(input.step.type);
  if (!service) {
    return {
      ok: false,
      summary: "この手順に対応する Live Adapter がありません",
      artifacts: [],
      errorCode: "automation_unsupported_step",
      errorMessage: `${input.step.type}_no_live_adapter`,
    };
  }

  const registry = await getAdapterRegistry({ mode });
  const adapter = registry.get(service);
  if (!adapter) {
    return {
      ok: false,
      summary: `${service} の Live Adapter が未登録です`,
      artifacts: [],
      errorCode: "automation_unsupported_step",
      errorMessage: `${service}_adapter_unregistered`,
    };
  }

  if (mode === "production" && adapter.mode !== "production") {
    return {
      ok: false,
      summary: "Production で sandbox/mock Adapter は使用できません",
      artifacts: [],
      errorCode: "automation_feature_disabled",
      errorMessage: "production_sandbox_forbidden",
    };
  }

  const text =
    typeof input.step.configuration.text === "string"
      ? input.step.configuration.text
      : typeof input.step.configuration.body === "string"
        ? input.step.configuration.body
        : typeof input.step.configuration.content === "string"
          ? input.step.configuration.content
          : input.automationName;

  const result = await adapter.execute({
    userId: input.userId,
    runId: input.runId,
    stepId: input.step.id,
    occurrenceKey: input.runId,
    configuration: input.step.configuration,
    approved: input.approved,
    artifactBuffer: input.artifactBuffer,
    artifactFileName: input.artifactFileName,
    artifactMimeType: input.artifactMimeType,
    contentHash: hashContent(text),
  });

  return toStepResult(result, `${adapter.service}結果`);
}
