/**
 * Typed outcomes for resolving a notification → result. Every「結果を見る」click
 * lands on exactly one of these — never a blank screen. Kept framework-free so
 * both the API route (server) and the results view (client) share one source.
 *
 * Titles mirror production user states:
 * 生成中 / 生成完了 / 保存失敗 / AIエラー / タイムアウト / 通知失敗
 * — never a generic「成果物が見つかりません」only.
 */
export type ResultResolutionCode =
  | "deliverable"
  | "pending"
  | "not_saved"
  | "generation_failed"
  | "ai_error"
  | "storage_failed"
  | "notification_failed"
  | "timeout"
  | "not_found"
  | "forbidden"
  | "legacy"
  | "unauthorized"
  | "unknown";

/** User-facing Japanese copy for each outcome (secretary tone, no internals). */
export const RESULT_MESSAGES: Record<ResultResolutionCode, string> = {
  deliverable: "成果物の準備ができました。内容をご確認ください。",
  pending: "完了すると通知でお知らせします",
  not_saved:
    "成果物の保存を確認しています。少し時間をおいて、もう一度お試しください。",
  generation_failed:
    "安全な範囲で再試行できます。入力内容は保存されています。",
  ai_error: "AI応答の作成で問題がありました。入力内容は保存されています。",
  storage_failed:
    "文書は作成できましたが、保存に失敗しました。もう一度お試しください。",
  notification_failed:
    "成果物は作成済みです。通知の配信に失敗したため、履歴からご確認ください。",
  timeout: "処理が時間内に終わりませんでした。もう一度お試しください。",
  not_found: "対象データが見つかりません。削除されたか、まだ保存が完了していない可能性があります。",
  forbidden: "この成果物を閲覧する権限がありません。",
  legacy: "この通知は旧形式のため結果を直接表示できません。",
  unauthorized: "ログインすると結果をご確認いただけます。",
  unknown: "処理状態を確認できませんでした。履歴からご確認ください。",
};

/** Shorter title shown above the detail message on the results page. */
export const RESULT_TITLES: Partial<Record<ResultResolutionCode, string>> = {
  deliverable: "生成完了",
  pending: "Wordを作成しています",
  not_saved: "保存確認中",
  generation_failed: "Wordの作成に失敗しました",
  ai_error: "AIエラー",
  storage_failed: "保存失敗",
  notification_failed: "通知失敗",
  timeout: "タイムアウト",
  not_found: "結果が見つかりません",
  forbidden: "権限がありません",
  legacy: "旧形式の通知です",
  unauthorized: "ログインが必要です",
  unknown: "状態を確認できません",
};

export function resultMessage(code: ResultResolutionCode): string {
  return RESULT_MESSAGES[code] ?? RESULT_MESSAGES.unknown;
}

export function resultTitle(code: ResultResolutionCode): string {
  return RESULT_TITLES[code] ?? "結果";
}
