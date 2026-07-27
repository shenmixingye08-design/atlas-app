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
  ai_content:
    "文書内容を作成できませんでした。入力内容は保存されています。再実行してください。",
  word_convert:
    "文書内容は完成しましたが、Wordファイルへの変換に失敗しました。",
  persist: "Wordファイルは完成しましたが、保存できませんでした。",
  download:
    "Wordファイルは保存されています。ダウンロードをもう一度お試しください。",
  notification:
    "Wordファイルは完成しています。成果物一覧から確認できます。",
  auth: "確認が必要です。もう一度ログインしてください。",
  forbidden: "このファイルを表示する権限がありません。",
  expired:
    "保存期限を過ぎた可能性があります。元の内容から再生成できます。",
  deleted: "この成果物は削除されています。",
  recovery_failed:
    "自動復旧できませんでした。再実行するか、サポートへエラー情報を送信してください。",
  unknown: "処理を完了できませんでした。内容をご確認ください。",
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
  unknown: ["retry", "send_support_info"],
};

export const USER_RECOVERY_ACTION_LABELS: Record<UserRecoveryAction, string> = {
  retry: "再試行",
  resume_from_last_stage: "続きから再開",
  review_content: "文書内容を確認",
  regenerate_word_only: "Wordだけ再生成",
  retry_persist: "保存だけ再試行",
  retry_download: "ダウンロードを再試行",
  send_support_info: "サポートへエラー情報送信",
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
  if (raw.includes("unauthorized") || raw.includes("auth") || raw.includes("401")) {
    return "auth";
  }
  if (raw.includes("forbidden") || raw.includes("403")) return "forbidden";
  if (raw.includes("expired") || raw.includes("ttl")) return "expired";
  if (raw.includes("deleted")) return "deleted";
  if (
    raw.includes("empty_deliverable") ||
    raw.includes("content_quality") ||
    raw.includes("ai_content") ||
    raw.includes("文書内容")
  ) {
    return "ai_content";
  }
  if (
    raw.includes("word生成失敗") ||
    raw.includes("docx") ||
    raw.includes("packer") ||
    raw.includes("verify")
  ) {
    return "word_convert";
  }
  if (
    raw.includes("storage") ||
    raw.includes("persist") ||
    raw.includes("upsert") ||
    raw.includes("保存")
  ) {
    return "persist";
  }
  if (raw.includes("download") || raw.includes("sha256") || raw.includes("integrity")) {
    return "download";
  }
  if (raw.includes("notification") || raw.includes("notify")) {
    return "notification";
  }
  return "unknown";
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
