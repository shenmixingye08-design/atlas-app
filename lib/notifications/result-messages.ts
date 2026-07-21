/**
 * Typed outcomes for resolving a notification → result. Every「結果を見る」click
 * lands on exactly one of these — never a blank screen. Kept framework-free so
 * both the API route (server) and the results view (client) share one source.
 */
export type ResultResolutionCode =
  | "deliverable"
  | "pending"
  | "not_saved"
  | "generation_failed"
  | "not_found"
  | "forbidden"
  | "legacy"
  | "unauthorized"
  | "unknown";

/** User-facing Japanese copy for each outcome (secretary tone, no internals). */
export const RESULT_MESSAGES: Record<ResultResolutionCode, string> = {
  deliverable: "成果物を表示しています。",
  pending: "まだ生成中です。少し時間をおいて、もう一度お試しください。",
  not_saved: "成果物がまだ保存されていません。",
  generation_failed: "成果物の生成に失敗しました。",
  not_found: "対象データが見つかりません。",
  forbidden: "この成果物を閲覧する権限がありません。",
  legacy: "この通知は旧形式のため結果を直接表示できません。",
  unauthorized: "ログインすると結果をご確認いただけます。",
  unknown: "対象データが見つかりません。",
};

/** Shorter title shown above the detail message on the results page. */
export const RESULT_TITLES: Partial<Record<ResultResolutionCode, string>> = {
  pending: "生成中です",
  not_saved: "成果物が見つかりません",
  generation_failed: "生成に失敗しました",
  not_found: "結果が見つかりません",
  forbidden: "権限がありません",
  legacy: "旧形式の通知です",
  unauthorized: "ログインが必要です",
  unknown: "結果が見つかりません",
};

export function resultMessage(code: ResultResolutionCode): string {
  return RESULT_MESSAGES[code] ?? RESULT_MESSAGES.unknown;
}

export function resultTitle(code: ResultResolutionCode): string {
  return RESULT_TITLES[code] ?? "結果";
}
