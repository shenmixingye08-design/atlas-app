/**
 * Production / E2E step invoker — Live Adapter Registry only.
 * Never marks unconnected / unwired / sandbox external actions as success.
 */

import type {
  StepInvoker,
  StepInvokeResult,
} from "@/lib/automation-platform/execution/step-invoker";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import {
  invokeLiveAdapterForStep,
  mapCapabilityToIntegrationService,
} from "@/lib/live-adapters";

function missingInput(message: string): StepInvokeResult {
  return {
    ok: false,
    summary: message,
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: message,
    needsUserInput: true,
  };
}

/**
 * Strict invoker used by production dispatch and E2E.
 * External steps go through Production/Preview/Test Live Adapter Registry.
 */
export const strictStepInvoker: StepInvoker = async (input) => {
  const { step, approved, userId, runId, automationName } = input;
  const capability = getCapability(step.type);
  if (!capability) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_unsupported_step",
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

  const service = mapCapabilityToIntegrationService(step.type);
  if (service) {
    // Lightweight field gates before adapter (clear user messages).
    if (step.type === "gmail") {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to.trim()
          : "";
      if (!to || to === "（宛先未設定）") {
        return missingInput("メール送信先が設定されていません");
      }
    }
    if (step.type === "x_post") {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.trim()
          : "";
      if (!text) return missingInput("投稿本文が設定されていません");
    }
    if (step.type === "dropbox") {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget.trim()
          : typeof step.configuration.folderPath === "string"
            ? step.configuration.folderPath.trim()
            : "";
      if (!dest) {
        return missingInput("Dropboxの保存先フォルダを選択してください");
      }
    }

    return invokeLiveAdapterForStep({
      step,
      userId,
      runId,
      approved,
      automationName,
    });
  }

  return defaultStepInvoker(input);
};
