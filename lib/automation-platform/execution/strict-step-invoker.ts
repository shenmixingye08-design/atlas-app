/**
 * Production V2 step invoker — real engines only, fail closed otherwise.
 *
 * Never marks unconnected external actions, unimplemented steps, or
 * placeholder artifacts as success.
 */

import "server-only";

import type {
  StepInvoker,
  StepInvokeResult,
} from "@/lib/automation-platform/execution/step-invoker";
import { invokeDeliverableStep } from "@/lib/automation-platform/execution/deliverable-step";
import {
  invokeOcrStep,
  invokeVisionStep,
} from "@/lib/automation-platform/execution/vision-step";
import {
  getProductionStep,
  isLiveAdapterWired,
} from "@/lib/automation-platform/execution/production-step-registry";
import { invokeGoogleCalendarLiveStep } from "@/lib/automation-platform/execution/google-calendar-step";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { createNotification } from "@/lib/notifications/service";

function stepNotImplemented(type: string): StepInvokeResult {
  return {
    ok: false,
    summary: "未実装の手順です",
    artifacts: [],
    errorCode: "step_not_implemented",
    errorMessage: `step_not_implemented:${type}`,
    failedStage: "STEP_DISPATCH",
    retryable: false,
  };
}

function liveAdapterMissing(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}の本番ライブ実行アダプタは未配線です`,
    artifacts: [],
    errorCode: "live_adapter_missing",
    errorMessage: `${service}_live_adapter_not_wired`,
    failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
    retryable: false,
  };
}

function missingInput(message: string): StepInvokeResult {
  return {
    ok: false,
    summary: message,
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: message,
    failedStage: "EXTERNAL_INPUT",
    retryable: false,
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
    failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
    retryable: false,
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
    failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
    retryable: false,
  };
}

function envConfigured(keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function googleAppConfigured(): boolean {
  return (
    envConfigured(["GOOGLE_CLIENT_ID"]) &&
    envConfigured(["GOOGLE_CLIENT_SECRET"])
  );
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

async function invokeNotifyStep(input: {
  step: Parameters<StepInvoker>[0]["step"];
  userId: string;
  automationName: string;
  runId: string;
}): Promise<StepInvokeResult> {
  const title =
    (typeof input.step.configuration.title === "string" &&
      input.step.configuration.title.trim()) ||
    "自動化の進捗";
  const message =
    (typeof input.step.configuration.message === "string" &&
      input.step.configuration.message.trim()) ||
    `「${input.automationName}」の通知手順を実行しました。`;

  const record = createNotification({
    audience: "user",
    userId: input.userId,
    type: "automation",
    title,
    message,
    relatedTaskId: input.runId,
    relatedService: "atlas",
    actionUrl: `/automations/runs/${encodeURIComponent(input.runId)}`,
    targetType: "automation_run",
    targetId: input.runId,
    requestId: input.runId,
  });

  if (!record?.notificationId) {
    return {
      ok: false,
      summary: "通知の作成に失敗しました",
      artifacts: [],
      errorCode: "run_notification_target_invalid",
      errorMessage: "notification_create_failed",
      failedStage: "NOTIFICATION",
      retryable: true,
    };
  }

  return {
    ok: true,
    summary: "通知を送信しました",
    artifacts: [
      {
        id: record.notificationId,
        kind: "file",
        label: title,
        url: `/results/${encodeURIComponent(record.notificationId)}`,
        externalId: record.notificationId,
        createdAt: new Date().toISOString(),
      },
    ],
    evidence: {
      notificationIds: [record.notificationId],
      artifactIds: [record.notificationId],
      storageObjectIds: [],
      externalActionIds: [],
      externalUrls: [],
    },
  };
}

function invokeWaitStep(step: Parameters<StepInvoker>[0]["step"]): StepInvokeResult {
  const raw = step.configuration.durationMs;
  const durationMs = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  if (durationMs < 0) {
    return {
      ok: false,
      summary: "待機時間が不正です",
      artifacts: [],
      errorCode: "automation_invalid_definition",
      errorMessage: "invalid_wait_duration",
      failedStage: "CONTROL_WAIT",
      retryable: false,
    };
  }
  // Production workers must not sleep long; only zero-duration control passes.
  if (durationMs > 0) {
    return {
      ok: false,
      summary: "正の待機時間はスケジューラ経路が必要です",
      artifacts: [],
      errorCode: "step_not_implemented",
      errorMessage: "wait_duration_requires_scheduler",
      failedStage: "CONTROL_WAIT",
      retryable: false,
    };
  }
  return {
    ok: true,
    summary: "待機条件を通過しました",
    artifacts: [],
    evidence: {},
  };
}

function invokeConditionStep(
  step: Parameters<StepInvoker>[0]["step"],
): StepInvokeResult {
  const expression = step.configuration.expression;
  if (typeof expression === "boolean") {
    if (!expression) {
      return {
        ok: false,
        summary: "条件を満たしませんでした",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: "condition_false",
        failedStage: "CONTROL_CONDITION",
        retryable: false,
      };
    }
    return {
      ok: true,
      summary: "条件を満たしました",
      artifacts: [],
      evidence: {},
    };
  }
  if (expression === "true" || expression === "1") {
    return {
      ok: true,
      summary: "条件を満たしました",
      artifacts: [],
      evidence: {},
    };
  }
  if (expression === "false" || expression === "0") {
    return {
      ok: false,
      summary: "条件を満たしませんでした",
      artifacts: [],
      errorCode: "automation_run_failed",
      errorMessage: "condition_false",
      failedStage: "CONTROL_CONDITION",
      retryable: false,
    };
  }
  return {
    ok: false,
    summary: "条件式が未設定または未対応です",
    artifacts: [],
    errorCode: "step_not_implemented",
    errorMessage: "condition_expression_unsupported",
    failedStage: "CONTROL_CONDITION",
    retryable: false,
  };
}

async function invokeExternalGate(
  service: string,
  adapterId: string,
  configured: boolean,
  live: boolean,
  inputOk: StepInvokeResult | null,
): Promise<StepInvokeResult> {
  if (inputOk) return inputOk;
  if (!configured) return notConnected(service);
  if (!live) return liveExternalDisabled(service);
  if (!isLiveAdapterWired(adapterId)) return liveAdapterMissing(service);
  return liveAdapterMissing(service);
}

/**
 * Strict invoker used by production dispatch.
 */
export const strictStepInvoker: StepInvoker = async (input) => {
  const { step, approved } = input;
  const production = getProductionStep(step.type);
  if (!production) {
    return stepNotImplemented(step.type);
  }

  const capability = getCapability(step.type);
  if (!capability || !capability.enabled) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_unsupported_step",
      errorMessage: `Unsupported capability: ${step.type}`,
      failedStage: "STEP_DISPATCH",
      retryable: false,
    };
  }

  if (capability.systemRequiresApproval && !approved) {
    // Calendar: invite/update/cancel gated inside the live adapter (never invite before approval).
    if (step.type !== "google_calendar") {
      return {
        ok: false,
        summary: "承認が必要です",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: "高リスク手順は承認後のみ実行できます",
        failedStage: "APPROVAL",
        retryable: false,
        needsUserInput: true,
      };
    }
  }

  const live = process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true";

  switch (step.type) {
    case "word_generate":
    case "excel_generate":
    case "pdf_generate":
    case "powerpoint_generate":
    case "deliverable_generate":
      return invokeDeliverableStep(input);

    case "vision_analysis":
      return invokeVisionStep(input);

    case "ocr":
      return invokeOcrStep(input);

    case "notify":
      return invokeNotifyStep(input);

    case "await_approval":
      return {
        ok: false,
        summary: "承認待ちです",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: "ユーザー承認が必要です",
        failedStage: "APPROVAL",
        retryable: false,
        needsUserInput: true,
      };

    case "wait":
      return invokeWaitStep(step);

    case "condition":
      return invokeConditionStep(step);

    case "gmail": {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to.trim()
          : "";
      return invokeExternalGate(
        "Gmail",
        "google_gmail",
        googleAppConfigured(),
        live,
        !to || to === "（宛先未設定）"
          ? missingInput("メール送信先が設定されていません")
          : null,
      );
    }
    case "x_post": {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.trim()
          : "";
      return invokeExternalGate(
        "X",
        "x",
        xAppConfigured(),
        live,
        !text ? missingInput("投稿本文が設定されていません") : null,
      );
    }
    case "dropbox": {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget.trim()
          : typeof step.configuration.folderPath === "string"
            ? step.configuration.folderPath.trim()
            : "";
      return invokeExternalGate(
        "Dropbox",
        "dropbox",
        dropboxAppConfigured(),
        live,
        !dest
          ? missingInput("Dropboxの保存先フォルダを選択してください")
          : null,
      );
    }
    case "google_calendar": {
      if (!googleAppConfigured()) {
        return notConnected("Google Calendar");
      }
      if (!isLiveAdapterWired("google_calendar")) {
        return liveAdapterMissing("Google Calendar");
      }
      return invokeGoogleCalendarLiveStep({
        step,
        userId: input.userId,
        runId: input.runId,
        approved,
        diagnosticId: input.diagnosticId ?? input.runId,
        approvalId: input.approvalId ?? null,
      });
    }
    case "wordpress":
      return invokeExternalGate(
        "WordPress",
        "wordpress",
        wordpressAppConfigured(),
        live,
        null,
      );

    default:
      return stepNotImplemented(step.type);
  }
};
