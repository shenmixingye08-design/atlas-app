import type { OAuthFailureReason } from "./types";

export function classifyOAuthFailure(input: {
  providerError?: string | null;
  hasCode?: boolean;
  hasState?: boolean;
  tokenSaved?: boolean;
  callbackException?: boolean;
  configured?: boolean;
}): OAuthFailureReason {
  if (input.configured === false) return "misconfigured";
  const error = (input.providerError ?? "").toLowerCase();
  if (
    error === "access_denied" ||
    error === "user_denied" ||
    error.includes("denied") ||
    error.includes("cancel")
  ) {
    return "user_cancelled";
  }
  if (error.includes("scope") || error === "invalid_scope") {
    return "insufficient_scope";
  }
  if (input.callbackException) return "callback_failed";
  if (input.hasCode && input.tokenSaved === false) return "token_persist_failed";
  if (!input.hasCode || !input.hasState) return "callback_failed";
  if (error) return "provider_error";
  return "callback_failed";
}

export function oauthFailureCopy(reason: OAuthFailureReason): string {
  switch (reason) {
    case "user_cancelled":
      return "連携をキャンセルしました。入力内容はそのまま残しています。";
    case "insufficient_scope":
      return "必要な権限が足りませんでした。もう一度接続してください。";
    case "token_persist_failed":
      return "接続情報を保存できませんでした。もう一度お試しください。";
    case "callback_failed":
      return "連携の戻り処理に失敗しました。最初からやり直さず再試行できます。";
    case "provider_error":
      return "接続先で障害が起きています。しばらくしてから再試行してください。";
    case "misconfigured":
      return "連携の設定が不足しています。運営側の確認が必要です。";
    default:
      return "連携に失敗しました。入力内容は残しています。";
  }
}
