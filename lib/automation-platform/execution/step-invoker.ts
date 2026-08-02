/**
 * Step invoker — executes one capability without mutating V1 automation history.
 * Document steps call the real deliverables engine (never url:null stub success).
 * External high-risk steps are gated by Approval / strict invoker.
 */

import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { isDeliverableGenerateStep } from "@/lib/automation-platform/execution/real-deliverable-policy";

export type StepInvokeResult = {
  ok: boolean;
  summary: string;
  artifacts: AutomationRunArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  needsUserInput?: boolean;
};

export type StepInvokerInput = {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
  approved: boolean;
  /** Freeform instruction notes from the automation definition. */
  assignmentNotes?: string | null;
  /** Public origin for download URLs. */
  requestOrigin?: string | null;
};

export type StepInvoker = (input: StepInvokerInput) => Promise<StepInvokeResult>;

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
 * Default invoker: document steps produce real downloadable artifacts.
 * High-risk external actions require approval (strict invoker hardens further).
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

  if (isDeliverableGenerateStep(step.type)) {
    const { invokeRealDeliverableStep } = await import(
      "@/lib/automation-platform/execution/invoke-real-deliverable"
    );
    return invokeRealDeliverableStep({
      stepType: step.type,
      stepName: step.name,
      configuration: step.configuration,
      userId: input.userId,
      automationName: input.automationName,
      runId: input.runId,
      assignmentNotes: input.assignmentNotes,
      requestOrigin: input.requestOrigin,
    });
  }

  switch (step.type) {
    case "ocr":
    case "vision_analysis":
    case "data_extract":
    case "file_convert":
      // Not on the ¥980 weekly-report critical path — fail closed (no fake file).
      return {
        ok: false,
        summary: `${capability.name}は現在この自動化経路では未接続です`,
        artifacts: [],
        errorCode: "automation_unsupported_step",
        errorMessage: `${step.type}_not_wired_in_v2_invoker`,
        needsUserInput: true,
      };
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
    case "gmail": {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to
          : "（宛先未設定）";
      return {
        ok: true,
        summary: `メール下書きを準備しました（${to}）`,
        artifacts: [artifact(`メール下書き: ${to}`, "draft")],
      };
    }
    case "x_post": {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.slice(0, 80)
          : "投稿下書き";
      return {
        ok: true,
        summary: "X投稿の下書きを準備しました（公開は承認済み手順のみ）",
        artifacts: [artifact(`X下書き: ${text}`, "draft")],
      };
    }
    case "wordpress":
      return {
        ok: true,
        summary: "WordPress公開内容を準備しました",
        artifacts: [artifact("WordPress下書き", "draft")],
      };
    case "dropbox": {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget
          : "Dropbox";
      return {
        ok: true,
        summary: `保存先 ${dest} への準備が完了しました`,
        artifacts: [artifact(`保存: ${dest}`, "external")],
      };
    }
    case "google_calendar":
      return {
        ok: true,
        summary: "カレンダー予定を準備しました",
        artifacts: [artifact("カレンダー予定", "external")],
      };
    case "orchestrate": {
      const assignment =
        typeof step.configuration.assignment === "string"
          ? step.configuration.assignment
          : input.automationName;
      // Planning/pass-through only — never claim a downloadable deliverable here.
      return {
        ok: true,
        summary: `依頼内容を整理しました: ${assignment.slice(0, 60)}`,
        artifacts: [],
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
