/**
 * Unified failure classification for MINERVOT work runs.
 * Used by retries, notifications, developer logs, and UI — never collapse
 * distinct failures into a generic「処理できませんでした」.
 */

export const FAILURE_CLASSES = [
  "openai",
  "network",
  "timeout",
  "json_parse",
  "save_failure",
  "generation_failure",
  "auth",
  "rate_limit",
  "cancelled",
  "unknown",
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const FAILURE_CLASS_LABELS: Record<FailureClass, string> = {
  openai: "OpenAIエラー",
  network: "ネットワークエラー",
  timeout: "タイムアウト",
  json_parse: "JSON解析失敗",
  save_failure: "保存失敗",
  generation_failure: "生成失敗",
  auth: "認証・権限エラー",
  rate_limit: "レート制限",
  cancelled: "ユーザー中止",
  unknown: "不明なエラー",
};

/** Estimated cause shown to the user (secretary tone, no stack traces). */
export const FAILURE_CLASS_CAUSE: Record<FailureClass, string> = {
  openai: "AI応答エラー",
  network: "通信の一時的な不通",
  timeout: "AI応答タイムアウト",
  json_parse: "成果物データの解析失敗",
  save_failure: "成果物の保存失敗",
  generation_failure: "成果物の生成失敗",
  auth: "連携・認証の確認が必要",
  rate_limit: "一時的な利用上限",
  cancelled: "ご指示による中止",
  unknown: "一時的な処理エラー",
};

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const extras: string[] = [error.message, error.name];
    const withCode = error as Error & {
      code?: string;
      status?: number | string;
      statusCode?: number | string;
    };
    if (withCode.code) extras.push(String(withCode.code));
    if (withCode.status != null) extras.push(String(withCode.status));
    if (withCode.statusCode != null) extras.push(String(withCode.statusCode));
    return extras.join(" ");
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

/**
 * Classify an error into a first-class FailureClass.
 * Order matters: more specific patterns win.
 */
export function classifyFailure(error: unknown): FailureClass {
  const raw = errorText(error);
  if (!raw.trim()) return "unknown";

  if (/cancel|中止|キャンセル/i.test(raw)) return "cancelled";
  if (
    /unauthorized|forbidden|oauth|認証|権限|api.?key|not configured|OPENAI_API_KEY/i.test(
      raw,
    )
  ) {
    if (/OPENAI_API_KEY|AI service is not configured/i.test(raw)) return "openai";
    return "auth";
  }
  if (/429|rate.?limit|quota|workflow_limit|利用上限/i.test(raw)) {
    return "rate_limit";
  }
  if (
    /timeout|timed?\s*out|ETIMEDOUT|aborted|タイムアウト|時間内に終わりません/i.test(
      raw,
    )
  ) {
    return "timeout";
  }
  if (
    /ECONNRESET|ENOTFOUND|ECONNREFUSED|fetch failed|network|ネットワーク|通信/i.test(
      raw,
    )
  ) {
    return "network";
  }
  if (
    /Invalid JSON|JSON\.parse|JSON解析|INVALID_JSON|JSON_LIKE_UNPARSEABLE|UNEXPECTED.?TOKEN/i.test(
      raw,
    )
  ) {
    return "json_parse";
  }
  if (
    /save.?fail|persist|upsert|保存に失敗|保存失敗|not_saved|project upsert/i.test(
      raw,
    )
  ) {
    return "save_failure";
  }
  if (
    /openai|gpt-|chat\.completions|responses\.create|AI応答|model_error/i.test(
      raw,
    )
  ) {
    return "openai";
  }
  if (
    /generation|deliverable|成果物|生成に失敗|生成失敗|EMPTY_RESPONSE|NO_USER_VISIBLE|worker/i.test(
      raw,
    )
  ) {
    return "generation_failure";
  }

  return "unknown";
}

/** Transient failures that should auto-retry. */
export function isRetryableFailureClass(failureClass: FailureClass): boolean {
  switch (failureClass) {
    case "openai":
    case "network":
    case "timeout":
    case "json_parse":
    case "save_failure":
    case "generation_failure":
    case "rate_limit":
    case "unknown":
      return true;
    case "auth":
    case "cancelled":
      return false;
    default:
      return false;
  }
}

export function isRetryableClassifiedFailure(error: unknown): boolean {
  return isRetryableFailureClass(classifyFailure(error));
}

export function failureClassLabel(failureClass: FailureClass): string {
  return FAILURE_CLASS_LABELS[failureClass];
}

export function failureClassCause(failureClass: FailureClass): string {
  return FAILURE_CLASS_CAUSE[failureClass];
}
