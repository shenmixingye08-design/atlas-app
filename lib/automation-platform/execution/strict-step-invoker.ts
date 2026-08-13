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
import {
  configMissingInput,
  invokeWiredExternalAdapter,
} from "@/lib/automation-platform/execution/adapters";
import type { ExternalAdapterInput } from "@/lib/automation-platform/execution/adapters";
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

function notConnected(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}連携が未接続のため実行できません`,
    artifacts: [],
    errorCode: "not_connected",
    errorMessage: "credential_missing",
    failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
    retryable: false,
    needsUserInput: true,
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
  automationId?: string | null;
  occurrenceKey?: string | null;
  priorArtifacts?: Array<{ id: string; label: string; url: string | null }>;
}): Promise<StepInvokeResult> {
  const title =
    (typeof input.step.configuration.title === "string" &&
      input.step.configuration.title.trim()) ||
    "自動化の進捗";
  const prior =
    (input.priorArtifacts ?? [])
      .slice(0, 3)
      .map((item) => item.label)
      .filter(Boolean)
      .join(" / ") || null;
  const message =
    (typeof input.step.configuration.message === "string" &&
      input.step.configuration.message.trim()) ||
    (prior
      ? `「${input.automationName}」が完了しました（${prior}）。`
      : `「${input.automationName}」の通知手順を実行しました。`);

  const { executeIdempotentSideEffect } = await import(
    "@/lib/side-effects/execute"
  );
  let record: Awaited<ReturnType<typeof createNotification>> = null;
  try {
    const sideEffect = await executeIdempotentSideEffect(
      {
        userId: input.userId,
        provider: "notification",
        actionType: "notify",
        destination: "in_app",
        automationId: input.automationId ?? null,
        runId: input.runId,
        occurrenceKey: input.occurrenceKey ?? input.runId,
        discriminator: input.step.id,
      },
      async () => {
        const created = await createNotification({
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
        if (!created?.notificationId) {
          throw new Error("notification_create_failed");
        }
        return {
          providerResourceId: created.notificationId,
          result: { record: created },
          evidence: { provider: "notification", stepId: input.step.id },
        };
      },
    );
    record = sideEffect.result.record;
  } catch {
    record = null;
  }

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

async function invokeExternalProduction(input: {
  service: string;
  adapterId: string;
  appConfigured: boolean;
  adapterInput: ExternalAdapterInput;
  inputError: StepInvokeResult | null;
}): Promise<StepInvokeResult> {
  if (input.inputError) return input.inputError;
  if (!input.appConfigured) return notConnected(input.service);
  if (!isLiveAdapterWired(input.adapterId)) {
    return liveAdapterMissing(input.service);
  }
  return invokeWiredExternalAdapter({
    adapterId: input.adapterId,
    service: input.service,
    adapterInput: input.adapterInput,
  });
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

  const adapterInput: ExternalAdapterInput = {
    step,
    userId: input.userId,
    automationName: input.automationName,
    automationId: input.automationId ?? null,
    runId: input.runId,
    occurrenceKey: input.occurrenceKey ?? input.runId,
    approved,
    priorArtifacts: input.priorArtifacts ?? [],
  };

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
      return invokeNotifyStep({
        step: input.step,
        userId: input.userId,
        automationName: input.automationName,
        runId: input.runId,
        automationId: input.automationId,
        occurrenceKey: input.occurrenceKey ?? input.runId,
        priorArtifacts: input.priorArtifacts ?? [],
      });

    case "await_approval":
      // Phase 3: after approve/resume, `approved=true` lets the control step pass.
      if (approved) {
        return {
          ok: true,
          summary: "承認済みのため続行します",
          artifacts: [],
          evidence: {
            artifactIds: [],
            storageObjectIds: [],
            externalActionIds: [],
            externalUrls: [],
            notificationIds: [],
          },
        };
      }
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
      return invokeExternalProduction({
        service: "Gmail",
        adapterId: "google_gmail",
        appConfigured: googleAppConfigured(),
        adapterInput,
        inputError:
          !to || to === "（宛先未設定）"
            ? configMissingInput("メール送信先が設定されていません")
            : null,
      });
    }
    case "x_post": {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.trim()
          : typeof step.configuration.body === "string"
            ? step.configuration.body.trim()
            : typeof step.configuration.content === "string"
              ? step.configuration.content.trim()
              : "";
      return invokeExternalProduction({
        service: "X",
        adapterId: "x",
        appConfigured: xAppConfigured(),
        adapterInput,
        inputError: !text
          ? configMissingInput("投稿本文が設定されていません")
          : null,
      });
    }
    case "dropbox": {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget.trim()
          : typeof step.configuration.folderPath === "string"
            ? step.configuration.folderPath.trim()
            : "";
      return invokeExternalProduction({
        service: "Dropbox",
        adapterId: "dropbox",
        appConfigured: dropboxAppConfigured(),
        adapterInput,
        inputError: !dest
          ? configMissingInput("Dropboxの保存先フォルダを選択してください")
          : null,
      });
    }
    case "google_calendar":
      return invokeExternalProduction({
        service: "Google Calendar",
        adapterId: "google_calendar",
        appConfigured: googleAppConfigured(),
        adapterInput,
        inputError: null,
      });
    case "wordpress":
      return invokeExternalProduction({
        service: "WordPress",
        adapterId: "wordpress",
        appConfigured: wordpressAppConfigured(),
        adapterInput,
        inputError: null,
      });

    default:
      return stepNotImplemented(step.type);
  }
};
