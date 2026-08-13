import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import { isRetryableFailure } from "@/lib/automation-platform/execution/retry-policy";

const NOT_CONNECTED = new Set([
  "google_not_connected",
  "x_not_connected",
  "wp_not_connected",
  "dropbox_not_connected",
  "not_connected",
  "credential_missing",
]);

const RECONNECT = new Set(["needs_reconnect", "auth_failure"]);

export function configMissingInput(message: string): StepInvokeResult {
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

export function mapProviderFailure(input: {
  service: string;
  status: string;
  message: string;
}): StepInvokeResult {
  const status = input.status.trim().toLowerCase();
  const message = input.message.trim() || `${input.service} failed`;

  if (NOT_CONNECTED.has(status) || /not.?connected|credential/i.test(status)) {
    return {
      ok: false,
      summary: `${input.service}連携が未接続のため実行できません`,
      artifacts: [],
      errorCode: "not_connected",
      errorMessage: "credential_missing",
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
      needsUserInput: true,
    };
  }

  if (RECONNECT.has(status)) {
    return {
      ok: false,
      summary: `${input.service}の再接続が必要です`,
      artifacts: [],
      errorCode: "not_connected",
      errorMessage: "needs_reconnect",
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
      needsUserInput: true,
    };
  }

  if (status === "feature_disabled") {
    return {
      ok: false,
      summary: `${input.service}機能が無効です`,
      artifacts: [],
      errorCode: "automation_feature_disabled",
      errorMessage: message,
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
    };
  }

  if (status === "plan_required" || status === "plan_limited") {
    return {
      ok: false,
      summary: message,
      artifacts: [],
      errorCode: "automation_permission_denied",
      errorMessage: message,
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
      needsUserInput: true,
    };
  }

  if (status === "insufficient_permission") {
    return {
      ok: false,
      summary: `${input.service}の権限が不足しています`,
      artifacts: [],
      errorCode: "automation_permission_denied",
      errorMessage: message,
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
      needsUserInput: true,
    };
  }

  if (status === "validation_failed") {
    return configMissingInput(message);
  }

  const retryable = isRetryableFailure({
    errorCode: "automation_run_failed",
    errorMessage: message,
  });

  return {
    ok: false,
    summary: `${input.service}の外部操作に失敗しました`,
    artifacts: [],
    errorCode: "automation_run_failed",
    errorMessage: message,
    failedStage: "EXTERNAL_PROVIDER_CALL",
    retryable,
  };
}

export function mapThrownProviderError(
  service: string,
  error: unknown,
): StepInvokeResult {
  const message =
    error instanceof Error ? error.message : `${service} provider error`;
  // Never surface tokens if a buggy path embeds them.
  const scrubbed = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(
      /(access_token|refresh_token|id_token)\s*[:=]\s*["']?[^"'&\s]+/gi,
      "$1=[redacted]",
    );

  if (
    /not.?connected|credential|token.?missing|no.?refresh/i.test(scrubbed)
  ) {
    return mapProviderFailure({
      service,
      status: "credential_missing",
      message: scrubbed,
    });
  }

  const retryable = isRetryableFailure({
    errorCode: "automation_run_failed",
    errorMessage: scrubbed,
  });

  return {
    ok: false,
    summary: `${service}の外部操作に失敗しました`,
    artifacts: [],
    errorCode: "automation_run_failed",
    errorMessage: scrubbed,
    failedStage: "EXTERNAL_PROVIDER_CALL",
    retryable,
  };
}

export function externalSuccess(input: {
  summary: string;
  provider: string;
  operation: string;
  resourceId: string;
  url?: string | null;
  label?: string;
}): StepInvokeResult {
  const resourceId = input.resourceId.trim();
  if (!resourceId) {
    return {
      ok: false,
      summary: "外部リソースIDが取得できませんでした",
      artifacts: [],
      errorCode: "automation_run_failed",
      errorMessage: "external_action_id_required",
      failedStage: "EXTERNAL_PROVIDER_CALL",
      retryable: false,
    };
  }

  const createdAt = new Date().toISOString();
  const url =
    input.url?.trim() ||
    `/results/${encodeURIComponent(`${input.provider}:${resourceId}`)}`;

  return {
    ok: true,
    summary: input.summary,
    artifacts: [
      {
        id: `${input.provider}_${resourceId}`,
        kind: "file",
        label: input.label ?? input.operation,
        url,
        externalId: resourceId,
        createdAt,
      },
    ],
    evidence: {
      artifactIds: [`${input.provider}_${resourceId}`],
      storageObjectIds: [],
      externalActionIds: [resourceId],
      externalUrls: url.startsWith("http") ? [url] : [],
      notificationIds: [],
    },
  };
}

export function configString(
  configuration: Readonly<Record<string, unknown>>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = configuration[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
