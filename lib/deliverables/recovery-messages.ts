/**
 * User-facing recovery copy for Word / deliverable failures.
 * Never expose raw stack traces or internal stage names to end users.
 */

export type DeliverableFailureKind =
  | "ai_content"
  | "word_convert"
  | "excel_structure"
  | "excel_workbook"
  | "excel_corrupt"
  | "excel_unsupported"
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
  ai_content:
    "AI応答の作成で問題がありました。入力内容は保存されています。再実行してください。",
  word_convert:
    "文書内容は完成しましたが、Wordファイルへの変換に失敗しました。",
  excel_structure:
    "表の形を読み取れませんでした。ヘッダー付きの表、CSV、または画像の表をもう一度送ってください。",
  excel_workbook:
    "Excelファイルの作成に失敗しました。同じ依頼でもう一度実行してください。繰り返す場合は列を減らして試してください。",
  excel_corrupt:
    "Excelファイルが壊れて保存できませんでした。もう一度生成してください。開かないファイルは成果物にしません。",
  excel_unsupported:
    "この依頼はExcelにできません。表・一覧・集計・家計簿など、表形式の依頼でやり直してください。",
  persist: "ファイルは完成しましたが、保存に失敗しました。もう一度お試しください。",
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
  timeout: "処理時間の上限に達しました。もう一度お試しください。",
  unknown: "処理を完了できませんでした。内容をご確認ください。",
};

const TITLES: Record<WordFailureCategory, string> = {
  ai_response: "AI応答失敗",
  word_generation: "Word生成失敗",
  storage: "Storage保存失敗",
  permission: "権限エラー",
  timeout: "Timeout",
  unknown: "生成に失敗しました",
};

const EXCEL_TITLES: Record<
  "excel_structure" | "excel_workbook" | "excel_corrupt" | "excel_unsupported",
  string
> = {
  excel_structure: "表の整理に失敗",
  excel_workbook: "Excel作成に失敗",
  excel_corrupt: "Excelファイルが破損",
  excel_unsupported: "Excelにできない依頼",
};

const ACTIONS: Record<DeliverableFailureKind, UserRecoveryAction[]> = {
  ai_content: ["retry", "review_content", "send_support_info"],
  word_convert: [
    "regenerate_word_only",
    "resume_from_last_stage",
    "review_content",
    "send_support_info",
  ],
  excel_structure: ["review_content", "retry", "send_support_info"],
  excel_workbook: ["retry", "send_support_info"],
  excel_corrupt: ["retry", "send_support_info"],
  excel_unsupported: ["review_content", "send_support_info"],
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
    /excel_corrupt|xlsx_reopen_failed|corrupted workbook/.test(raw)
  ) {
    return "excel_corrupt";
  }
  if (
    /excel_unsupported|excel_advanced_no_aggregatable/.test(raw)
  ) {
    return "excel_unsupported";
  }
  if (/excel_structure|no_worksheet|empty_sheet/.test(raw)) {
    return "excel_structure";
  }
  if (
    /excel_workbook|excel_chart|excel_advanced|exceljs/.test(raw)
  ) {
    return "excel_workbook";
  }
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
    case "excel_structure":
    case "excel_workbook":
    case "excel_corrupt":
    case "excel_unsupported":
      return "unknown";
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
  if (
    kind === "excel_structure" ||
    kind === "excel_workbook" ||
    kind === "excel_corrupt" ||
    kind === "excel_unsupported"
  ) {
    return EXCEL_TITLES[kind];
  }
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
