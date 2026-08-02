import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

export type AdapterValidationResult = {
  ok: boolean;
  code:
    | "ok"
    | "missing_configuration"
    | "missing_connection"
    | "missing_adapter"
    | "feature_disabled"
    | "insufficient_input"
    | "insufficient_scope";
  message: string;
  needsUserInput?: boolean;
};

export type StepExecutionStatus =
  | "succeeded"
  | "failed"
  | "needs_configuration"
  | "needs_input"
  | "skipped";

export type AdapterCostUsage = {
  aiCalls: number;
  externalCalls: number;
  estimatedTokens: number | null;
};

export type StepExecutionResult = {
  status: StepExecutionStatus;
  startedAt: string;
  completedAt: string;
  summary: string;
  outputBindings: Record<string, unknown>;
  artifacts: AutomationRunArtifact[];
  artifactIds: string[];
  externalActionIds: string[];
  notificationIds: string[];
  requestId: string;
  diagnosticId: string;
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  costUsage: AdapterCostUsage;
};

export type AutomationStepAdapterContext = {
  step: AutomationWorkflowStep;
  userId: string;
  automationId: string;
  automationName: string;
  runId: string;
  attempt: number;
  approved: boolean;
  priorArtifacts: AutomationRunArtifact[];
  instructionText: string;
  freeformNotes: string;
  structuredOptions: Readonly<Record<string, unknown>>;
  access: FeatureAccessContext;
  occurrenceKey: string | null;
};

export type AutomationStepAdapter = {
  type: AutomationCapabilityId;
  validateConfiguration(
    context: AutomationStepAdapterContext,
  ): Promise<AdapterValidationResult>;
  execute(
    context: AutomationStepAdapterContext,
  ): Promise<StepExecutionResult>;
};

export function emptyCostUsage(): AdapterCostUsage {
  return { aiCalls: 0, externalCalls: 0, estimatedTokens: null };
}

export function newRequestIds(): { requestId: string; diagnosticId: string } {
  return {
    requestId: `areq_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    diagnosticId: `adiag_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
  };
}

export function failResult(
  input: {
    status?: StepExecutionStatus;
    summary: string;
    errorCode: string;
    errorMessage: string;
    retryable?: boolean;
    startedAt?: string;
  },
): StepExecutionResult {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const ids = newRequestIds();
  return {
    status: input.status ?? "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    summary: input.summary,
    outputBindings: {},
    artifacts: [],
    artifactIds: [],
    externalActionIds: [],
    notificationIds: [],
    requestId: ids.requestId,
    diagnosticId: ids.diagnosticId,
    retryable: Boolean(input.retryable),
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    costUsage: emptyCostUsage(),
  };
}
