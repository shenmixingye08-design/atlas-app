export type XRecurringErrorCode =
  | "x_not_connected"
  | "x_reconnect_required"
  | "x_missing_access_token"
  | "x_missing_refresh_token"
  | "x_token_expired"
  | "x_refresh_failed"
  | "x_permission_missing"
  | "x_auth_failed"
  | "x_rate_limited"
  | "x_post_limit"
  | "x_text_empty"
  | "x_text_too_long"
  | "scheduler_not_running"
  | "database_save_failed"
  | "duplicate_execution"
  | "job_disabled"
  | "billing_blocked"
  | "internal_error";

export type XRecurringError = {
  code: XRecurringErrorCode;
  message: string;
  action: string;
};

const ERRORS: Record<XRecurringErrorCode, Omit<XRecurringError, "code">> = {
  x_not_connected: {
    message: "Xが連携されていません。外部連携画面からXを連携してください。",
    action: "設定の外部連携からXを連携してください。",
  },
  x_reconnect_required: {
    message: "Xとの再連携が必要です。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_missing_access_token: {
    message: "Xとの再連携が必要です。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_missing_refresh_token: {
    message: "Xとの再連携が必要です。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_token_expired: {
    message: "Xのアクセストークンの有効期限が切れています。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_refresh_failed: {
    message: "Xトークンの更新に失敗しました。再連携が必要です。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_permission_missing: {
    message: "Xへの投稿権限が不足しています。",
    action: "外部連携画面からXを再連携し、投稿権限を許可してください。",
  },
  x_auth_failed: {
    message: "X APIの認証に失敗しました。",
    action: "外部連携画面からXを再連携してください。",
  },
  x_rate_limited: {
    message: "X APIのレート制限に達しました。",
    action: "しばらく待ってから再試行してください。",
  },
  x_post_limit: {
    message: "投稿上限に達したため実行できません。",
    action: "プランまたは本日の投稿枠をご確認ください。",
  },
  x_text_empty: {
    message: "投稿文が空のため投稿できません。",
    action: "実行内容を見直し、投稿文が生成されるよう調整してください。",
  },
  x_text_too_long: {
    message: "投稿文が長すぎます。",
    action: "文字数を減らして再実行してください。",
  },
  scheduler_not_running: {
    message: "スケジューラーが起動していません。",
    action: "運営へお問い合わせください。",
  },
  database_save_failed: {
    message: "定期仕事の保存に失敗しました。",
    action: "時間をおいて再度お試しください。",
  },
  duplicate_execution: {
    message: "同じ予定の投稿はすでに実行済みです。",
    action: "実行履歴をご確認ください。",
  },
  job_disabled: {
    message: "この定期仕事は停止中です。",
    action: "再開してから再度お試しください。",
  },
  billing_blocked: {
    message: "ご契約または利用制限により実行できません。",
    action: "プラン・請求画面をご確認ください。",
  },
  internal_error: {
    message: "内部エラーにより投稿できませんでした。",
    action: "時間をおいて再試行するか、運営へお問い合わせください。",
  },
};

export function getXRecurringError(code: XRecurringErrorCode): XRecurringError {
  return { code, ...ERRORS[code] };
}

export function mapConnectionFailureToError(input: {
  connected: boolean;
  status?: string;
  permissionsOk?: boolean;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  tokenExpired?: boolean;
}): XRecurringError {
  if (!input.connected) {
    if (input.status === "reconnect_required" || input.status === "error") {
      return getXRecurringError("x_reconnect_required");
    }
    return getXRecurringError("x_not_connected");
  }
  if (input.hasAccessToken === false) {
    return getXRecurringError("x_missing_access_token");
  }
  if (input.hasRefreshToken === false) {
    return getXRecurringError("x_missing_refresh_token");
  }
  if (input.tokenExpired) {
    return getXRecurringError("x_token_expired");
  }
  if (input.permissionsOk === false) {
    return getXRecurringError("x_permission_missing");
  }
  return getXRecurringError("x_reconnect_required");
}
