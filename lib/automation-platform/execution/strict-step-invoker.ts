/**
 * Production / E2E step invoker — never marks unconnected external actions as success.
 *
 * Live side-effects require AUTOMATION_E2E_LIVE_EXTERNAL=true AND connector env/config.
 * Without those, external steps fail closed (not silent draft success).
 */

import type {
  StepInvoker,
  StepInvokeResult,
} from "@/lib/automation-platform/execution/step-invoker";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";

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

function notConnected(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}連携が未接続のため実行できません`,
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: `${service} is not connected`,
    needsUserInput: true,
  };
}

function liveExternalDisabled(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}連携のライブ外部実行フラグがOFFです`,
    artifacts: [],
    errorCode: "automation_feature_disabled",
    errorMessage: "AUTOMATION_E2E_LIVE_EXTERNAL is not true",
  };
}

/** Refuse fake live success — real connector adapters are not wired into V2 yet. */
function liveAdapterMissing(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}の本番ライブ実行アダプタは未配線です`,
    artifacts: [],
    errorCode: "automation_unsupported_step",
    errorMessage: `${service}_live_adapter_not_wired`,
  };
}

function envConfigured(keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function googleAppConfigured(): boolean {
  return envConfigured(["GOOGLE_CLIENT_ID"]) && envConfigured(["GOOGLE_CLIENT_SECRET"]);
}

function xAppConfigured(): boolean {
  return (
    envConfigured(["X_TEST_ACCESS_TOKEN"]) ||
    (envConfigured(["X_CLIENT_ID"]) && envConfigured(["X_CLIENT_SECRET"]))
  );
}

function dropboxAppConfigured(): boolean {
  return (
    envConfigured(["DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"]) &&
    envConfigured(["DROPBOX_APP_SECRET", "DROPBOX_CLIENT_SECRET"])
  );
}

function wordpressAppConfigured(): boolean {
  return envConfigured(["ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY"]);
}

/**
 * Strict invoker used by production dispatch and E2E.
 * External steps require connection config + required fields; never silent success.
 */
export const strictStepInvoker: StepInvoker = async (input) => {
  const { step, approved } = input;
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

  const live = process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true";

  switch (step.type) {
    case "gmail": {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to.trim()
          : "";
      if (!to || to === "（宛先未設定）") {
        return missingInput("メール送信先が設定されていません");
      }
      if (!googleAppConfigured()) return notConnected("Gmail");
      if (!live) return liveExternalDisabled("Gmail");
      return liveAdapterMissing("Gmail");
    }
    case "x_post": {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.trim()
          : "";
      if (!text) return missingInput("投稿本文が設定されていません");
      if (!xAppConfigured()) return notConnected("X");
      if (!live) return liveExternalDisabled("X");
      return liveAdapterMissing("X");
    }
    case "dropbox": {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget.trim()
          : "";
      if (!dest) {
        return missingInput("Dropboxの保存先フォルダを選択してください");
      }
      if (!dropboxAppConfigured()) return notConnected("Dropbox");
      if (!live) return liveExternalDisabled("Dropbox");
      return liveAdapterMissing("Dropbox");
    }
    case "google_calendar": {
      if (!googleAppConfigured()) return notConnected("Google Calendar");
      if (!live) return liveExternalDisabled("Google Calendar");
      return liveAdapterMissing("Google Calendar");
    }
    case "wordpress": {
      if (!wordpressAppConfigured()) return notConnected("WordPress");
      if (!live) return liveExternalDisabled("WordPress");
      return liveAdapterMissing("WordPress");
    }
    default:
      return defaultStepInvoker(input);
  }
};
