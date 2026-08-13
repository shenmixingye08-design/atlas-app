/**
 * Phase 3 — classify step/run failures into actionable classes.
 * Never leave failures as opaque "unknown" when a code is present.
 */

export type AutomationFailureClass =
  | "retryable"
  | "non_retryable"
  | "credential_required"
  | "approval_required"
  | "external_api_failure"
  | "artifact_failure"
  | "validation_required"
  | "unknown";

const CREDENTIAL_CODES = [
  "not_connected",
  "reconnect_required",
  "token_expired",
  "insufficient_permission",
  "credential",
  "oauth",
];

const APPROVAL_CODES = [
  "automation_approval_required",
  "approval_required",
  "awaiting_approval",
];

const ARTIFACT_CODES = [
  "run_artifact_missing",
  "artifact_url_required",
  "external_action_id_required",
  "completion_evidence_missing",
  "deliverable",
  "export_verify",
];

const VALIDATION_CODES = [
  "automation_invalid_definition",
  "config_missing",
  "input_required",
  "external_step_missing",
  "step_not_implemented",
];

const EXTERNAL_CODES = [
  "provider",
  "google_",
  "gmail",
  "calendar",
  "wordpress",
  "dropbox",
  "x_post",
  "rate_limit",
  "network",
];

export function classifyAutomationFailure(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  failedStage?: string | null;
  retryable?: boolean | null;
}): {
  failureClass: AutomationFailureClass;
  retryable: boolean;
  reason: string;
} {
  const code = `${input.errorCode ?? ""}`.toLowerCase();
  const message = `${input.errorMessage ?? ""}`.toLowerCase();
  const stage = `${input.failedStage ?? ""}`.toUpperCase();
  const blob = `${code} ${message} ${stage}`;

  if (APPROVAL_CODES.some((item) => blob.includes(item)) || stage === "APPROVAL") {
    return {
      failureClass: "approval_required",
      retryable: false,
      reason: "ユーザー承認が必要です",
    };
  }
  if (CREDENTIAL_CODES.some((item) => blob.includes(item))) {
    return {
      failureClass: "credential_required",
      retryable: false,
      reason: "連携の再接続または権限付与が必要です",
    };
  }
  if (ARTIFACT_CODES.some((item) => blob.includes(item))) {
    return {
      failureClass: "artifact_failure",
      retryable: Boolean(input.retryable),
      reason: "成果物または外部IDの証拠が不足しています",
    };
  }
  if (VALIDATION_CODES.some((item) => blob.includes(item))) {
    return {
      failureClass: "validation_required",
      retryable: false,
      reason: "設定または手順定義の修正が必要です",
    };
  }
  const looksExternal =
    stage.includes("PROVIDER") ||
    EXTERNAL_CODES.some((item) => blob.includes(item));
  if (looksExternal) {
    const retryable = input.retryable !== false;
    return {
      failureClass: retryable ? "retryable" : "external_api_failure",
      retryable,
      reason: "外部APIまたは一時障害の可能性があります",
    };
  }
  if (input.retryable === true) {
    return {
      failureClass: "retryable",
      retryable: true,
      reason: "一時的な失敗として再試行できます",
    };
  }
  if (input.retryable === false) {
    return {
      failureClass: "non_retryable",
      retryable: false,
      reason: input.errorMessage?.slice(0, 160) || "再試行できない失敗です",
    };
  }
  return {
    failureClass: "unknown",
    retryable: false,
    reason:
      input.errorMessage?.slice(0, 160) ||
      input.errorCode ||
      "失敗原因を特定できませんでした",
  };
}
