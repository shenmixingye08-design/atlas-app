/** Safe, non-secret error codes returned by push APIs / client flows. */
export const PUSH_ERROR_CODES = [
  "authentication_required",
  "push_not_supported",
  "permission_denied",
  "permission_dismissed",
  "service_worker_failed",
  "vapid_public_key_missing",
  "vapid_private_key_missing",
  "vapid_subject_missing",
  "web_push_not_configured",
  "push_subscription_failed",
  "invalid_subscription",
  "subscription_save_failed",
  "persistence_unavailable",
  "rate_limit_exceeded",
  "no_active_subscription",
  "delivery_failed",
  "invalid_request",
] as const;

export type PushErrorCode = (typeof PUSH_ERROR_CODES)[number];

export function isPushErrorCode(value: string): value is PushErrorCode {
  return (PUSH_ERROR_CODES as readonly string[]).includes(value);
}

/** User-facing Japanese copy for each error code (no secrets / internals). */
export function pushErrorMessageJa(code: PushErrorCode): string {
  switch (code) {
    case "authentication_required":
      return "ログインが必要です。再度ログインしてからお試しください。";
    case "push_not_supported":
      return "このブラウザはスマホ通知に対応していません。Android の Chrome などでお試しください。";
    case "permission_denied":
      return "ブラウザまたは端末で通知が拒否されています。設定から許可してください。";
    case "permission_dismissed":
      return "通知の許可が完了しませんでした。もう一度お試しください。";
    case "service_worker_failed":
      return "通知の準備（Service Worker）に失敗しました。ページを再読み込みしてからお試しください。";
    case "vapid_public_key_missing":
      return "スマホ通知の公開設定が未完了です。運営側の設定が必要です。";
    case "vapid_private_key_missing":
    case "vapid_subject_missing":
    case "web_push_not_configured":
      return "スマホ通知のサーバー設定が未完了です。運営側の設定が必要です。";
    case "push_subscription_failed":
      return "端末への通知登録に失敗しました。通信環境を確認して再試行してください。";
    case "invalid_subscription":
      return "通知登録情報が不正です。もう一度有効化してください。";
    case "subscription_save_failed":
    case "persistence_unavailable":
      return "通知登録の保存に失敗しました。しばらくしてから再試行してください。";
    case "rate_limit_exceeded":
      return "操作が集中しています。少し待ってから再試行してください。";
    case "no_active_subscription":
      return "登録済みの端末がありません。先にスマホ通知を有効にしてください。";
    case "delivery_failed":
      return "通知の送信に失敗しました。端末の登録状態を確認してください。";
    case "invalid_request":
      return "リクエストが不正です。ページを再読み込みしてからお試しください。";
    default:
      return "スマホ通知の処理に失敗しました。";
  }
}
