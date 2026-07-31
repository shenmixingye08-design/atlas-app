/**
 * User-facing recovery copy for Word / deliverable failures.
 * Never expose raw stack traces or internal stage names to end users.
 */

export type DeliverableFailureKind =
  | "ai_content"
  | "word_convert"
  | "persist"
  | "download"
  | "notification"
  | "auth"
  | "forbidden"
  | "expired"
  | "deleted"
  | "recovery_failed"
  | "timeout"
  | "unknown";

/** Categories requested for production user messaging. */
export type WordFailureCategory =
  | "ai_response"
  | "word_generation"
  | "storage"
  | "permission"
  | "timeout"
  | "unknown";

export type UserRecoveryAction =
  | "retry"
  | "resume_from_last_stage"
  | "review_content"
  | "regenerate_word_only"
  | "retry_persist"
  | "retry_download"
  | "send_support_info";

const MESSAGES: Record<DeliverableFailureKind, string> = {
  ai_content: "処理を続けています",
  word_convert: "処理を続けています",
  persist: "処理を続けています",
  download: "こちらをご確認ください。もう一度お開きください。",
  notification: "お仕事が終わりました。こちらです。",
  auth: "確認が必要です。もう一度ログインしてください。",
  forbidden: "このファイルを表示する権限がありません。",
  expired: "保存期限を過ぎた可能性があります。もう一度お任せください。",
  deleted: "この成果物は削除されています。",
  recovery_failed: "処理を続けています",
  timeout: "処理を続けています",
  unknown: "処理を続けています",
};

const TITLES: Record<WordFailureCategory, string> = {
  ai_response: "AI応答失敗",
  word_generation: "Word生成失敗",
  storage: "Storage保存失敗",
  permission: "権限エラー",
  timeout: "Timeout",
  unknown: "生成に失敗しました",
};

const ACTIONS: Record<DeliverableFailureKind, UserRecoveryAction[]> = {
  ai_content: ["retry", "review_content", "send_support_info"],
  word_convert: [
    "regenerate_word_only",
    "resume_from_last_stage",
    "review_content",
    "send_support_info",
  ],
  persist: ["retry_persist", "resume_from_last_stage", "send_support_info"],
  download: ["retry_download", "send_support_info"],
  notification: ["retry_download"],
  auth: ["retry"],
  forbidden: ["send_support_info"],
  expired: ["regenerate_word_only", "retry", "send_support_info"],
  deleted: ["send_support_info"],
  recovery_failed: ["retry", "send_support_info"],
  timeout: ["retry", "send_support_info"],
  unknown: ["retry", "send_support_info"],
};

export function userMessageForFailure(kind: DeliverableFailureKind): string {
  return MESSAGES[kind];
}

export function recoveryActionsForFailure(
  kind: DeliverableFailureKind,
): UserRecoveryAction[] {
  return [...ACTIONS[kind]];
}

export function classifyDeliverableError(
  error: string | null | undefined,
): DeliverableFailureKind {
  const raw = (error ?? "").toLowerCase();
  if (!raw) return "unknown";
  if (/timeout|etimedout|aborted|maxduration|時間内/.test(raw)) {
    return "timeout";
  }
  if (raw.includes("unauthorized") || raw.includes("auth") || raw.includes("401")) {
    return "auth";
  }
  if (raw.includes("forbidden") || raw.includes("403") || raw.includes("権限")) {
    return "forbidden";
  }
  if (raw.includes("expired") || raw.includes("ttl")) return "expired";
  if (raw.includes("deleted")) return "deleted";
  if (
    raw.includes("empty_deliverable") ||
    raw.includes("word_export_empty") ||
    raw.includes("content_quality") ||
    raw.includes("ai_content") ||
    raw.includes("openai") ||
    raw.includes("文書内容") ||
    raw.includes("ai応答")
  ) {
    return "ai_content";
  }
  if (
    raw.includes("storage") ||
    raw.includes("persist") ||
    raw.includes("upsert") ||
    raw.includes("supabase") ||
    raw.includes("bucket") ||
    raw.includes("保存")
  ) {
    return "persist";
  }
  if (
    raw.includes("word生成失敗") ||
    raw.includes("word_convert") ||
    raw.includes("docx") ||
    raw.includes("packer") ||
    raw.includes("verify") ||
    raw.includes("word_export")
  ) {
    return "word_convert";
  }
  if (raw.includes("download") || raw.includes("sha256") || raw.includes("integrity")) {
    return "download";
  }
  if (raw.includes("notification") || raw.includes("notify")) {
    return "notification";
  }
  if (
    raw.includes("cannot read properties of undefined") ||
    raw.includes("reading 'trim'") ||
    raw.includes("typeerror")
  ) {
    // Known export crash class — treat as Word generation until content is repaired.
    return "word_convert";
  }
  return "unknown";
}

export function toWordFailureCategory(
  kind: DeliverableFailureKind,
): WordFailureCategory {
  switch (kind) {
    case "ai_content":
      return "ai_response";
    case "word_convert":
    case "download":
    case "notification":
    case "recovery_failed":
      return "word_generation";
    case "persist":
      return "storage";
    case "auth":
    case "forbidden":
      return "permission";
    case "timeout":
      return "timeout";
    default:
      return "unknown";
  }
}

export function wordFailureTitle(reason: string | null | undefined): string {
  const kind = classifyDeliverableError(reason);
  return TITLES[toWordFailureCategory(kind)];
}

export function wordFailureUserMessage(
  reason: string | null | undefined,
): string {
  return userMessageForFailure(classifyDeliverableError(reason));
}

/** Safe support payload — no tokens, cookies, or full document body. */
export function buildSupportErrorPayload(input: {
  jobId?: string | null;
  deliverableId?: string | null;
  stage?: string | null;
  failureKind: DeliverableFailureKind;
  httpStatus?: number | null;
  format?: string | null;
}): string {
  return JSON.stringify(
    {
      jobId: input.jobId ?? null,
      deliverableId: input.deliverableId ?? null,
      stage: input.stage ?? null,
      failureKind: input.failureKind,
      httpStatus: input.httpStatus ?? null,
      format: input.format ?? null,
      at: new Date().toISOString(),
    },
    null,
    2,
  );
}
