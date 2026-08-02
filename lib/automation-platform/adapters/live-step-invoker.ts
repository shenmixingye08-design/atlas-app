import "server-only";

import { getLiveStepAdapter, missingAdapterResult } from "@/lib/automation-platform/adapters/registry";
import { toStepInvokeResult } from "@/lib/automation-platform/adapters/result-map";
import type { AutomationStepAdapterContext } from "@/lib/automation-platform/adapters/types";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import { persistAutomationAuditEvent } from "@/lib/automation-platform/audit/durable-audit";

async function resolveAccess(userId: string) {
  try {
    const email = await getClerkUserPrimaryEmail(userId);
    return buildFeatureAccessContext(email);
  } catch {
    return buildFeatureAccessContext(null);
  }
}

/**
 * Production live invoker — routes every capability through the Live Adapter Registry.
 * Missing adapters fail closed (never stub success).
 */
export const liveStepInvoker: StepInvoker = async (input) => {
  const capability = getCapability(input.step.type);
  if (!capability) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_unsupported_step",
      errorMessage: `Unsupported capability: ${input.step.type}`,
    };
  }

  if (capability.systemRequiresApproval && !input.approved) {
    return {
      ok: false,
      summary: "承認が必要です",
      artifacts: [],
      errorCode: "automation_approval_required",
      errorMessage: "高リスク手順は承認後のみ実行できます",
      needsUserInput: true,
    };
  }

  const adapter = getLiveStepAdapter(input.step.type);
  if (!adapter) {
    return toStepInvokeResult(missingAdapterResult(input.step.type));
  }

  const access = await resolveAccess(input.userId);
  const context: AutomationStepAdapterContext = {
    step: input.step,
    userId: input.userId,
    automationId: input.automationId ?? "unknown",
    automationName: input.automationName,
    runId: input.runId,
    attempt: input.attempt ?? 1,
    approved: input.approved,
    priorArtifacts: input.priorArtifacts ?? [],
    instructionText: input.instructionText ?? "",
    freeformNotes: input.freeformNotes ?? "",
    structuredOptions: input.structuredOptions ?? {},
    access,
    occurrenceKey: input.occurrenceKey ?? null,
  };

  const validation = await adapter.validateConfiguration(context);
  if (!validation.ok) {
    const result = toStepInvokeResult({
      status: validation.needsUserInput ? "needs_input" : "needs_configuration",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: validation.message,
      outputBindings: {},
      artifacts: [],
      artifactIds: [],
      externalActionIds: [],
      notificationIds: [],
      requestId: `areq_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      diagnosticId: `adiag_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      retryable: false,
      errorCode:
        validation.code === "insufficient_input"
          ? "automation_integration_required"
          : validation.code === "feature_disabled"
            ? "automation_feature_disabled"
            : "automation_integration_required",
      errorMessage: validation.message,
      costUsage: { aiCalls: 0, externalCalls: 0, estimatedTokens: null },
    });
    return result;
  }

  const executed = await adapter.execute(context);
  const mapped = toStepInvokeResult(executed);

  const audit = appendAutomationAudit({
    actorUserId: input.userId,
    action: "automation.step.execute",
    automationId: context.automationId,
    runId: input.runId,
    outcome: mapped.ok ? "success" : "error",
    errorCode: mapped.errorCode ?? null,
    meta: {
      stepId: input.step.id,
      capability: input.step.type,
      requestId: executed.requestId,
      diagnosticId: executed.diagnosticId,
      retryable: executed.retryable,
      artifactCount: executed.artifactIds.length,
      externalActionCount: executed.externalActionIds.length,
      costUsage: executed.costUsage,
    },
  });
  void persistAutomationAuditEvent(input.userId, audit);

  return mapped;
};
