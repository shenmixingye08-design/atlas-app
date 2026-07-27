/**
 * User-facing failure labels for the Word / deliverable pipeline.
 * Keep AI content failures separate from Word conversion / store / notify.
 */

export type DeliverableFailureStage =
  | "request_accept"
  | "ai_content"
  | "ai_content_empty"
  | "ai_content_structure"
  | "format_detect"
  | "word_generate"
  | "word_verify"
  | "store"
  | "metadata"
  | "notification"
  | "download";

export const DELIVERABLE_USER_MESSAGES = {
  ai_content: "文書内容の作成に失敗しました。自動再試行します。",
  ai_content_empty: "文書内容が空でした。もう一度生成します。",
  ai_content_structure: "文書内容の構造を整えられませんでした。再試行します。",
  format_detect: "成果物の形式を判定できませんでした。",
  word_generate:
    "文書内容は作成できましたが、Wordファイルへの変換に失敗しました。",
  word_verify:
    "文書内容は作成できましたが、Wordファイルの検証に失敗しました。",
  store: "Wordファイルは作成できましたが、保存に失敗しました。",
  metadata: "Wordファイルは作成できましたが、成果物登録に失敗しました。",
  notification:
    "Wordファイルは完成しています。成果物一覧から確認してください。",
  download: "ダウンロードに失敗しました。もう一度お試しください。",
  request_accept: "依頼を受け付けられませんでした。",
} as const;

export function userMessageForStage(
  stage: DeliverableFailureStage,
): string {
  return DELIVERABLE_USER_MESSAGES[stage];
}

/** Map engine reason strings to a stable stage + user message. */
export function classifyDeliverableFailureReason(reason: string): {
  stage: DeliverableFailureStage;
  userMessage: string;
} {
  const text = reason.trim();
  if (
    text.includes("Word生成成功・保存失敗") ||
    text.includes("生成成功・保存失敗")
  ) {
    return { stage: "store", userMessage: DELIVERABLE_USER_MESSAGES.store };
  }
  if (text.includes("Word検証") || /verify_failed|forbidden:/i.test(text)) {
    return {
      stage: "word_verify",
      userMessage: DELIVERABLE_USER_MESSAGES.word_verify,
    };
  }
  if (text.startsWith("Word生成失敗") || text.includes("Packer")) {
    return {
      stage: "word_generate",
      userMessage: DELIVERABLE_USER_MESSAGES.word_generate,
    };
  }
  if (text === "empty_deliverable" || /empty/i.test(text)) {
    return {
      stage: "ai_content_empty",
      userMessage: DELIVERABLE_USER_MESSAGES.ai_content_empty,
    };
  }
  if (/structure|normalize|json.?like|forbidden.?fallback/i.test(text)) {
    return {
      stage: "ai_content_structure",
      userMessage: DELIVERABLE_USER_MESSAGES.ai_content_structure,
    };
  }
  return {
    stage: "word_generate",
    userMessage: DELIVERABLE_USER_MESSAGES.word_generate,
  };
}
