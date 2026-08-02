import type { AutomationErrorCode } from "./codes";

export type AutomationErrorPresentation = {
  code: AutomationErrorCode;
  /** Safe message for end users (JA). */
  userMessage: string;
  /** Developer-facing diagnostic hint (EN/JA mix OK). */
  diagnostic: string;
  httpStatus: number;
};

const PRESENTATIONS: Record<AutomationErrorCode, AutomationErrorPresentation> =
  {
    automation_not_found: {
      code: "automation_not_found",
      userMessage: "指定された自動化が見つかりませんでした。",
      diagnostic: "Automation id missing or not owned by caller.",
      httpStatus: 404,
    },
    automation_permission_denied: {
      code: "automation_permission_denied",
      userMessage: "この自動化を操作する権限がありません。",
      diagnostic: "Ownership or role check failed.",
      httpStatus: 403,
    },
    automation_invalid_definition: {
      code: "automation_invalid_definition",
      userMessage: "自動化の定義が正しくありません。内容をご確認ください。",
      diagnostic: "Schema validation failed for automation definition.",
      httpStatus: 400,
    },
    automation_invalid_schedule: {
      code: "automation_invalid_schedule",
      userMessage: "スケジュールの指定が正しくありません。",
      diagnostic: "Schedule/timezone validation failed.",
      httpStatus: 400,
    },
    automation_conflicting_instruction: {
      code: "automation_conflicting_instruction",
      userMessage:
        "設定項目と備考の内容が矛盾しています。ご確認のうえ、どちらかに合わせてください。",
      diagnostic: "structuredOptions conflict with freeformNotes.",
      httpStatus: 409,
    },
    automation_integration_required: {
      code: "automation_integration_required",
      userMessage: "この自動化には外部連携の接続が必要です。",
      diagnostic: "Required connector missing or disconnected.",
      httpStatus: 400,
    },
    automation_memory_scope_invalid: {
      code: "automation_memory_scope_invalid",
      userMessage: "記憶の利用範囲の指定が正しくありません。",
      diagnostic: "Unknown or disallowed memory scope.",
      httpStatus: 400,
    },
    automation_duplicate_occurrence: {
      code: "automation_duplicate_occurrence",
      userMessage: "同じ実行タイミングの処理はすでに受け付けています。",
      diagnostic: "scheduleOccurrenceKey / idempotency conflict.",
      httpStatus: 409,
    },
    automation_paused: {
      code: "automation_paused",
      userMessage: "この自動化は一時停止中です。",
      diagnostic: "Automation status is paused.",
      httpStatus: 409,
    },
    automation_disabled: {
      code: "automation_disabled",
      userMessage: "この自動化は無効です。",
      diagnostic: "Automation status is disabled or archived.",
      httpStatus: 409,
    },
    automation_approval_required: {
      code: "automation_approval_required",
      userMessage: "実行前の承認が必要です。",
      diagnostic: "Execution policy requires approval.",
      httpStatus: 402,
    },
    automation_approval_expired: {
      code: "automation_approval_expired",
      userMessage: "承認の有効期限が切れました。",
      diagnostic: "Approval timeout reached.",
      httpStatus: 409,
    },
    automation_run_failed: {
      code: "automation_run_failed",
      userMessage: "自動化の実行に失敗しました。",
      diagnostic: "Run ended in failed status.",
      httpStatus: 500,
    },
    automation_migration_failed: {
      code: "automation_migration_failed",
      userMessage: "自動化データの移行に失敗しました。",
      diagnostic: "V1→V2 migration failed for one or more records.",
      httpStatus: 500,
    },
    automation_unsupported_step: {
      code: "automation_unsupported_step",
      userMessage: "この手順にはまだ対応していません。",
      diagnostic: "Step type missing from capability registry.",
      httpStatus: 400,
    },
    automation_timeout: {
      code: "automation_timeout",
      userMessage: "自動化の実行が時間切れになりました。",
      diagnostic: "Run or step exceeded timeoutPolicy.",
      httpStatus: 504,
    },
    automation_feature_disabled: {
      code: "automation_feature_disabled",
      userMessage: "新しい自動化機能は現在ご利用いただけません。",
      diagnostic: "Feature flag automation_v2_enabled is off.",
      httpStatus: 503,
    },
    automation_invalid_transition: {
      code: "automation_invalid_transition",
      userMessage: "この操作は現在の状態では行えません。",
      diagnostic: "Illegal AutomationRun status transition.",
      httpStatus: 409,
    },
    automation_rate_limited: {
      code: "automation_rate_limited",
      userMessage: "操作が集中しています。しばらくしてから再度お試しください。",
      diagnostic: "Rate limit exceeded for automation API.",
      httpStatus: 429,
    },
    automation_unauthorized: {
      code: "automation_unauthorized",
      userMessage: "ログインが必要です。",
      diagnostic: "Missing authenticated user.",
      httpStatus: 401,
    },
    run_not_found: {
      code: "run_not_found",
      userMessage: "指定された実行履歴が見つかりませんでした。",
      diagnostic: "Run id missing or not owned by caller.",
      httpStatus: 404,
    },
    run_permission_denied: {
      code: "run_permission_denied",
      userMessage: "この実行を操作する権限がありません。",
      diagnostic: "Run ownership check failed.",
      httpStatus: 403,
    },
    run_invalid_state: {
      code: "run_invalid_state",
      userMessage: "この操作は現在の実行状態では行えません。",
      diagnostic: "Run is in an invalid state for the requested operation.",
      httpStatus: 409,
    },
    run_already_completed: {
      code: "run_already_completed",
      userMessage: "この実行はすでに完了しています。",
      diagnostic: "Run already in a successful terminal state.",
      httpStatus: 409,
    },
    run_already_cancelled: {
      code: "run_already_cancelled",
      userMessage: "この実行はすでにキャンセルされています。",
      diagnostic: "Run already cancelled.",
      httpStatus: 409,
    },
    run_retry_not_allowed: {
      code: "run_retry_not_allowed",
      userMessage: "この実行は再実行できません。",
      diagnostic: "Retry rejected by policy or terminal constraints.",
      httpStatus: 409,
    },
    run_step_retry_not_allowed: {
      code: "run_step_retry_not_allowed",
      userMessage: "この手順は再実行できません。",
      diagnostic: "Step retry blocked (external action completed or invalid).",
      httpStatus: 409,
    },
    run_resume_not_allowed: {
      code: "run_resume_not_allowed",
      userMessage: "この実行は再開できません。",
      diagnostic: "Resume not allowed from current run state.",
      httpStatus: 409,
    },
    run_cancel_failed: {
      code: "run_cancel_failed",
      userMessage: "実行のキャンセルに失敗しました。",
      diagnostic: "Cancel transition failed.",
      httpStatus: 500,
    },
    run_artifact_missing: {
      code: "run_artifact_missing",
      userMessage: "指定された成果物が見つかりませんでした。",
      diagnostic: "Artifact id missing on run.",
      httpStatus: 404,
    },
    run_notification_target_invalid: {
      code: "run_notification_target_invalid",
      userMessage: "通知の移動先が無効です。",
      diagnostic: "Notification target missing or not owned.",
      httpStatus: 404,
    },
    run_external_action_already_completed: {
      code: "run_external_action_already_completed",
      userMessage: "この外部操作はすでに完了しているため、再実行しません。",
      diagnostic: "Idempotent skip of completed external action.",
      httpStatus: 409,
    },
    run_history_load_failed: {
      code: "run_history_load_failed",
      userMessage: "実行履歴の読み込みに失敗しました。",
      diagnostic: "Failed to load run history.",
      httpStatus: 500,
    },
    run_progress_unavailable: {
      code: "run_progress_unavailable",
      userMessage: "進捗情報を取得できませんでした。",
      diagnostic: "Progress view unavailable for run.",
      httpStatus: 503,
    },
    run_timeout: {
      code: "run_timeout",
      userMessage: "実行が時間切れになりました。",
      diagnostic: "Run exceeded timeout.",
      httpStatus: 504,
    },
  };

export function getAutomationErrorPresentation(
  code: AutomationErrorCode,
): AutomationErrorPresentation {
  return PRESENTATIONS[code];
}

export class AutomationPlatformError extends Error {
  readonly code: AutomationErrorCode;
  readonly userMessage: string;
  readonly diagnostic: string;
  readonly httpStatus: number;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: AutomationErrorCode,
    details?: Readonly<Record<string, unknown>>,
  ) {
    const presentation = getAutomationErrorPresentation(code);
    super(presentation.diagnostic);
    this.name = "AutomationPlatformError";
    this.code = code;
    this.userMessage = presentation.userMessage;
    this.diagnostic = presentation.diagnostic;
    this.httpStatus = presentation.httpStatus;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
      },
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
