/**
 * Production Step Registry — allowlist for V2 Automation execution.
 * Steps not registered here MUST fail closed (never stub/mock success).
 */

import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";

export type ProductionStepKind =
  | "deliverable"
  | "vision"
  | "ocr"
  | "regenerate"
  | "notification"
  | "control"
  | "external";

export type ProductionCompletionRequirement =
  | "artifact_with_url"
  | "artifact_with_external_id"
  | "notification_id"
  | "control_pass"
  | "vision_result"
  | "ocr_result";

export type ProductionStepDefinition = {
  type: AutomationCapabilityId;
  kind: ProductionStepKind;
  productionInvoker: "strictStepInvoker";
  requiredAdapter: string | null;
  completionRequirements: readonly ProductionCompletionRequirement[];
  retryableByDefault: boolean;
  idempotent: boolean;
  evidenceRequired: boolean;
  /** When true, automation activation is refused if live adapter is missing. */
  requireLiveAdapterAtActivation: boolean;
};

/**
 * Only steps with a real Production invoker path.
 * Unlisted capability ids are execution-forbidden.
 */
export const PRODUCTION_STEP_REGISTRY: readonly ProductionStepDefinition[] = [
  {
    type: "word_generate",
    kind: "deliverable",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["artifact_with_url"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "excel_generate",
    kind: "deliverable",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["artifact_with_url"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "pdf_generate",
    kind: "deliverable",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["artifact_with_url"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "powerpoint_generate",
    kind: "deliverable",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["artifact_with_url"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "deliverable_generate",
    kind: "deliverable",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["artifact_with_url"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "vision_analysis",
    kind: "vision",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "openai_vision",
    completionRequirements: ["vision_result"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "ocr",
    kind: "ocr",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "openai_vision_ocr",
    completionRequirements: ["ocr_result"],
    retryableByDefault: true,
    idempotent: false,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "notify",
    kind: "notification",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["notification_id"],
    retryableByDefault: false,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "await_approval",
    kind: "control",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["control_pass"],
    retryableByDefault: false,
    idempotent: true,
    evidenceRequired: false,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "wait",
    kind: "control",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["control_pass"],
    retryableByDefault: false,
    idempotent: true,
    evidenceRequired: false,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "condition",
    kind: "control",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: null,
    completionRequirements: ["control_pass"],
    retryableByDefault: false,
    idempotent: true,
    evidenceRequired: false,
    requireLiveAdapterAtActivation: false,
  },
  {
    type: "gmail",
    kind: "external",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "google_gmail",
    completionRequirements: ["artifact_with_external_id"],
    retryableByDefault: true,
    idempotent: false,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: true,
  },
  {
    type: "x_post",
    kind: "external",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "x",
    completionRequirements: ["artifact_with_external_id"],
    retryableByDefault: true,
    idempotent: false,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: true,
  },
  {
    type: "dropbox",
    kind: "external",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "dropbox",
    completionRequirements: ["artifact_with_external_id"],
    retryableByDefault: true,
    idempotent: true,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: true,
  },
  {
    type: "google_calendar",
    kind: "external",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "google_calendar",
    completionRequirements: ["artifact_with_external_id"],
    retryableByDefault: true,
    idempotent: false,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: true,
  },
  {
    type: "wordpress",
    kind: "external",
    productionInvoker: "strictStepInvoker",
    requiredAdapter: "wordpress",
    completionRequirements: ["artifact_with_external_id"],
    retryableByDefault: true,
    idempotent: false,
    evidenceRequired: true,
    requireLiveAdapterAtActivation: true,
  },
] as const;

const BY_TYPE = new Map(
  PRODUCTION_STEP_REGISTRY.map((entry) => [entry.type, entry] as const),
);

/** Capability ids that exist in UI registry but are NOT production-executable. */
export const NON_PRODUCTION_CAPABILITY_IDS: readonly AutomationCapabilityId[] = [
  "file_convert",
  "data_extract",
  "orchestrate",
] as const;

export function getProductionStep(
  type: string,
): ProductionStepDefinition | undefined {
  return BY_TYPE.get(type as AutomationCapabilityId);
}

export function isProductionStepType(type: string): boolean {
  return BY_TYPE.has(type as AutomationCapabilityId);
}

export function listProductionStepTypes(): AutomationCapabilityId[] {
  return PRODUCTION_STEP_REGISTRY.map((entry) => entry.type);
}

export type ProductionStepValidationIssue = {
  stepId: string;
  stepType: string;
  errorCode:
    | "step_not_implemented"
    | "live_adapter_missing"
    | "automation_unsupported_step";
  message: string;
};

/**
 * Live adapters are not yet wired into V2 Production invoker.
 * Activation refuses enabled external steps that require them.
 */
export function isLiveAdapterWired(adapterId: string | null): boolean {
  if (!adapterId) return true;
  // Production wiring gate — set true only when a real adapter path exists.
  const wired = new Set<string>([
    // Internal engines (not external OAuth adapters)
    "openai_vision",
    "openai_vision_ocr",
    // External Production Live adapters
    "google_calendar",
  ]);
  return wired.has(adapterId);
}

export function validateStepsForProductionActivation(
  steps: ReadonlyArray<{ id: string; type: string; enabled: boolean }>,
): ProductionStepValidationIssue[] {
  const issues: ProductionStepValidationIssue[] = [];
  for (const step of steps) {
    if (!step.enabled) continue;
    const def = getProductionStep(step.type);
    if (!def) {
      issues.push({
        stepId: step.id,
        stepType: step.type,
        errorCode: "step_not_implemented",
        message: `Production未登録の手順です: ${step.type}`,
      });
      continue;
    }
    if (
      def.requireLiveAdapterAtActivation &&
      !isLiveAdapterWired(def.requiredAdapter)
    ) {
      issues.push({
        stepId: step.id,
        stepType: step.type,
        errorCode: "live_adapter_missing",
        message: `Live Adapter未配線のため有効化できません: ${def.requiredAdapter}`,
      });
    }
  }
  return issues;
}
