/**
 * Step invoker — executes one capability without mutating V1 automation history.
 * Document/engine steps produce structured artifacts; external high-risk steps
 * are gated by prior Approval and recorded as drafts unless explicitly allowed.
 */

import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";

// AutomationRunArtifact kept for StepInvokeResult typing.

export type StepInvokeResult = {
  ok: boolean;
  summary: string;
  artifacts: AutomationRunArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  needsUserInput?: boolean;
  retryable?: boolean;
  requestId?: string;
  diagnosticId?: string;
  costUsage?: {
    aiCalls: number;
    externalCalls: number;
    estimatedTokens: number | null;
  };
  externalActionIds?: string[];
  notificationIds?: string[];
  outputBindings?: Record<string, unknown>;
};

export type StepInvoker = (input: {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  automationId?: string;
  runId: string;
  approved: boolean;
  attempt?: number;
  priorArtifacts?: AutomationRunArtifact[];
  instructionText?: string;
  freeformNotes?: string;
  structuredOptions?: Readonly<Record<string, unknown>>;
  occurrenceKey?: string | null;
}) => Promise<StepInvokeResult>;

/**
 * Legacy/default invoker — fail-closed for live capabilities.
 * Production dispatch uses liveStepInvoker (strictStepInvoker alias).
 */
export const defaultStepInvoker: StepInvoker = async (input) => {
  const { step, approved } = input;
  const capability = getCapability(step.type);
  if (!capability) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_invalid_definition",
      errorMessage: `Unsupported capability: ${step.type}`,
    };
  }

  if (capability.systemRequiresApproval && !approved) {
    return {
      ok: false,
      summary: "承認が必要です",
      artifacts: [],
      errorCode: "automation_approval_required",
      errorMessage: "高リスク手順は承認後のみ実行できます",
      needsUserInput: true,
    };
  }

  switch (step.type) {
    case "ocr":
    case "vision_analysis":
    case "data_extract":
    case "file_convert":
    case "word_generate":
    case "excel_generate":
    case "pdf_generate":
    case "powerpoint_generate":
    case "deliverable_generate":
    case "notify":
    case "orchestrate":
      // Legacy default invoker must not fake live success.
      // Production dispatch uses liveStepInvoker / strictStepInvoker.
      return {
        ok: false,
        summary: `${capability.name}はライブアダプタ経由でのみ実行できます`,
        artifacts: [],
        errorCode: "automation_unsupported_step",
        errorMessage: `${step.type}_requires_live_adapter`,
      };
    case "wait":
    case "condition":
      return {
        ok: true,
        summary: `${capability.name}を通過しました`,
        artifacts: [],
      };
    case "await_approval":
      return {
        ok: false,
        summary: "承認待ちです",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: "ユーザー承認が必要です",
        needsUserInput: true,
      };
    case "gmail":
    case "x_post":
    case "wordpress":
    case "dropbox":
    case "google_calendar":
      return {
        ok: false,
        summary: `${capability.name}はライブアダプタ経由でのみ実行できます`,
        artifacts: [],
        errorCode: "automation_unsupported_step",
        errorMessage: `${step.type}_requires_live_adapter`,
      };
    default:
      return {
        ok: false,
        summary: "未対応の手順です",
        artifacts: [],
        errorCode: "automation_invalid_definition",
        errorMessage: `No invoker for ${step.type}`,
      };
  }
};
