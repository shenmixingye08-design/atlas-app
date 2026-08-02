import "server-only";

import { getLiveStepAdapter } from "@/lib/automation-platform/adapters/registry";
import type { AdapterValidationResult } from "@/lib/automation-platform/adapters/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureFlagId } from "@/lib/feature-flags/types";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";

export type PreflightIssue = {
  stepId: string;
  capability: string;
  code: AdapterValidationResult["code"] | "missing_adapter" | "feature_disabled";
  message: string;
  needsUserInput: boolean;
};

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
};

/**
 * Validate that an automation can be activated / run.
 * Incomplete automations must remain draft.
 */
export async function preflightAutomationActivation(input: {
  automation: AutomationV2;
  access: FeatureAccessContext;
}): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  if (!isFeatureEnabled("automation_v2_enabled", input.access)) {
    issues.push({
      stepId: "*",
      capability: "*",
      code: "feature_disabled",
      message: "automation_v2_enabled がOFFです",
      needsUserInput: false,
    });
    return { ok: false, issues };
  }

  await ensureExternalAuthHydrated(input.automation.userId);

  for (const step of input.automation.workflow.steps) {
    if (!step.enabled) continue;
    const capability = getCapability(step.type);
    if (!capability) {
      issues.push({
        stepId: step.id,
        capability: step.type,
        code: "missing_adapter",
        message: `未対応の手順: ${step.type}`,
        needsUserInput: false,
      });
      continue;
    }

    if (
      capability.requiredFeatureFlag &&
      !isFeatureEnabled(
        capability.requiredFeatureFlag as FeatureFlagId,
        input.access,
      )
    ) {
      issues.push({
        stepId: step.id,
        capability: step.type,
        code: "feature_disabled",
        message: `機能フラグ ${capability.requiredFeatureFlag} が無効です`,
        needsUserInput: false,
      });
    }

    if (capability.requiredConnector) {
      const connection = getExternalServiceConnection(
        input.automation.userId,
        capability.requiredConnector as ExternalServiceId,
      );
      if (connection.status !== "connected") {
        issues.push({
          stepId: step.id,
          capability: step.type,
          code: "missing_connection",
          message: `${capability.requiredConnector} 連携が未接続です`,
          needsUserInput: true,
        });
      }
    }

    const adapter = getLiveStepAdapter(step.type);
    if (!adapter) {
      issues.push({
        stepId: step.id,
        capability: step.type,
        code: "missing_adapter",
        message: `${step.type} のライブアダプタが未接続です`,
        needsUserInput: false,
      });
      continue;
    }

    const validation = await adapter.validateConfiguration({
      step,
      userId: input.automation.userId,
      automationId: input.automation.id,
      automationName: input.automation.name,
      runId: "preflight",
      attempt: 0,
      approved: true,
      priorArtifacts: [],
      instructionText:
        (typeof input.automation.instruction.structuredOptions.assignment ===
          "string" &&
          input.automation.instruction.structuredOptions.assignment) ||
        input.automation.instruction.freeformNotes ||
        input.automation.name,
      freeformNotes: input.automation.instruction.freeformNotes,
      structuredOptions: input.automation.instruction.structuredOptions,
      access: input.access,
      occurrenceKey: null,
    });

    if (!validation.ok) {
      issues.push({
        stepId: step.id,
        capability: step.type,
        code: validation.code,
        message: validation.message,
        needsUserInput: Boolean(validation.needsUserInput),
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
