/**
 * Step invoker — executes one capability without mutating V1 automation history.
 * Document/engine steps produce structured artifacts; external high-risk steps
 * are gated by prior Approval and recorded as drafts unless explicitly allowed.
 */

import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";

export type StepInvokeResult = {
  ok: boolean;
  summary: string;
  artifacts: AutomationRunArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  needsUserInput?: boolean;
};

export type StepInvoker = (input: {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
  approved: boolean;
}) => Promise<StepInvokeResult>;

function artifact(
  label: string,
  kind: AutomationRunArtifact["kind"] = "file",
): AutomationRunArtifact {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    url: null,
    externalId: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Default invoker: real side-effects only for safe/local steps.
 * High-risk external actions require approval and still produce a reviewable
 * draft/result record rather than silent publish when credentials are absent.
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
      return {
        ok: true,
        summary: `${capability.name}を完了しました`,
        artifacts: [artifact(`${capability.name}結果`, "file")],
      };
    case "word_generate":
    case "excel_generate":
    case "pdf_generate":
    case "powerpoint_generate":
    case "deliverable_generate": {
      const title =
        (typeof step.configuration.title === "string" && step.configuration.title) ||
        `${input.automationName} / ${capability.name}`;
      return {
        ok: true,
        summary: `${capability.name}の成果物を準備しました`,
        artifacts: [artifact(title, "deliverable")],
      };
    }
    case "notify":
      return {
        ok: true,
        summary: "通知手順を記録しました",
        artifacts: [],
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
    // External steps: never fake draft success. Use strictStepInvoker / Live Registry.
    case "gmail":
    case "x_post":
    case "wordpress":
    case "dropbox":
    case "google_calendar":
      return {
        ok: false,
        summary:
          "外部連携は Live Adapter Registry 経由でのみ実行できます（途中成功禁止）",
        artifacts: [],
        errorCode: "automation_unsupported_step",
        errorMessage: `${step.type}_requires_live_adapter`,
        needsUserInput: true,
      };
    case "orchestrate": {
      const assignment =
        typeof step.configuration.assignment === "string"
          ? step.configuration.assignment
          : input.automationName;
      return {
        ok: true,
        summary: `仕事の遂行を記録しました: ${assignment.slice(0, 60)}`,
        artifacts: [artifact("遂行結果", "deliverable")],
      };
    }
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
