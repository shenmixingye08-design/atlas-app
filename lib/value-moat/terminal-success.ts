/**
 * VALUE 5 — terminal success is never "LLM text generated".
 */

export type TerminalWorkKind =
  | "x_post"
  | "word"
  | "excel"
  | "pdf"
  | "powerpoint"
  | "gmail_draft"
  | "gmail_send"
  | "calendar"
  | "notify";

export type TerminalSuccessEvidence = {
  kind: TerminalWorkKind;
  providerPosted?: boolean;
  tweetId?: string | null;
  artifactSaved?: boolean;
  artifactVerified?: boolean;
  readBackVerified?: boolean;
  qualityGatePassed?: boolean;
  downloadable?: boolean;
  notified?: boolean;
  generationSucceeded?: boolean;
};

export type TerminalSuccessResult = {
  complete: boolean;
  reason: string;
};

export function evaluateTerminalSuccess(
  evidence: TerminalSuccessEvidence,
): TerminalSuccessResult {
  switch (evidence.kind) {
    case "x_post":
      if (!evidence.providerPosted || !evidence.tweetId) {
        return {
          complete: false,
          reason: "Xへの投稿成功が確認できるまで完了にしません",
        };
      }
      return { complete: true, reason: "provider側投稿成功" };
    case "word":
      if (!evidence.artifactSaved || !evidence.downloadable) {
        return {
          complete: false,
          reason: "有効なdocxの保存成功が確認できるまで完了にしません",
        };
      }
      return { complete: true, reason: "有効なdocx artifact保存成功" };
    case "excel":
      if (!evidence.artifactSaved || !evidence.downloadable) {
        return {
          complete: false,
          reason: "有効なxlsxの保存成功が確認できるまで完了にしません",
        };
      }
      return { complete: true, reason: "有効なxlsx artifact保存成功" };
    case "pdf":
      if (
        !evidence.artifactSaved ||
        !evidence.readBackVerified ||
        !evidence.downloadable
      ) {
        return {
          complete: false,
          reason: "PDF保存と読み戻し検証が成功するまで完了にしません",
        };
      }
      return { complete: true, reason: "PDF保存 + 読み戻し検証成功" };
    case "powerpoint":
      if (
        !evidence.artifactSaved ||
        !evidence.qualityGatePassed ||
        !evidence.downloadable
      ) {
        return {
          complete: false,
          reason: "PPTX保存と品質Gate成功が確認できるまで完了にしません",
        };
      }
      return { complete: true, reason: "PPTX保存 + 最低品質Gate成功" };
    case "gmail_send":
      if (!evidence.providerPosted) {
        return { complete: false, reason: "送信成功が確認できるまで完了にしません" };
      }
      return { complete: true, reason: "Gmail送信成功" };
    case "gmail_draft":
      if (!evidence.artifactSaved && !evidence.providerPosted) {
        return { complete: false, reason: "下書き保存成功が確認できるまで完了にしません" };
      }
      return { complete: true, reason: "Gmail下書き保存成功" };
    case "calendar":
      if (!evidence.providerPosted) {
        return { complete: false, reason: "予定の作成成功が確認できるまで完了にしません" };
      }
      return { complete: true, reason: "Calendar作成成功" };
    case "notify":
      return {
        complete: Boolean(evidence.notified),
        reason: evidence.notified ? "通知送信成功" : "通知未送信",
      };
    default:
      return { complete: false, reason: "未対応の仕事種別" };
  }
}

export function shouldEmitSuccessNotification(
  evidence: TerminalSuccessEvidence,
): boolean {
  return evaluateTerminalSuccess(evidence).complete;
}

export function isGenerationOnlySuccess(
  evidence: TerminalSuccessEvidence,
): boolean {
  return (
    evidence.generationSucceeded === true &&
    !evaluateTerminalSuccess(evidence).complete
  );
}
