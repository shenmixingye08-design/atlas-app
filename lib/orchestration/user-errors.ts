import type { OrchestrationResult } from "./types";
import { ui } from "@/lib/i18n";

export type UserFacingError = {
  title: string;
  message: string;
  action: string;
};

/** Map pipeline/API errors to user-safe Japanese messages. */
export function toUserFacingError(
  error: unknown,
  result?: OrchestrationResult | null,
): UserFacingError {
  if (result?.stepError?.step === "worker" || result?.error?.includes("Production")) {
    return {
      title: ui.work.deliverableTitle,
      message: ui.work.workerDeliverableFailed,
      action: "依頼内容を具体化して、もう一度実行してください。",
    };
  }

  if (
    result?.isolationDebug?.pipeline?.needsReviewReason?.includes(
      ui.work.workerNotExecuted,
    )
  ) {
    return {
      title: ui.work.deliverableTitle,
      message: ui.work.workerNotExecuted,
      action: "依頼内容を確認して、もう一度実行してください。",
    };
  }

  if (result && !result.approved && result.deliverable) {
    return {
      title: ui.work.deliverableTitle,
      message: ui.work.deliverableNeedsReview,
      action: "成果物の内容を確認し、必要なら依頼文を修正して再実行してください。",
    };
  }

  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (/timed out|timeout/i.test(raw)) {
    return {
      title: "処理がタイムアウトしました",
      message: "AIチームの処理に時間がかかりすぎました。",
      action: "依頼を短く分けて、もう一度実行してください。",
    };
  }

  if (/limit exceeded|workflow_limit|quota|rate limit|429/i.test(raw)) {
    return {
      title: "利用上限に達しました",
      message: "この依頼は処理上限に達したため、安全のため停止しました。",
      action: "しばらく待ってから再実行するか、依頼内容を短くしてください。",
    };
  }

  if (/OPENAI_API_KEY|AI service is not configured/i.test(raw)) {
    return {
      title: "AIサービス未設定",
      message: "AIサービスが設定されていないため、処理を開始できません。",
      action: "管理者に OPENAI_API_KEY の設定を依頼してください。",
    };
  }

  if (/Invalid JSON|JSON/i.test(raw)) {
    return {
      title: ui.work.deliverableTitle,
      message: ui.work.deliverableEmpty,
      action: "もう一度実行してください。改善しない場合は依頼内容を変更してください。",
    };
  }

  if (result?.error) {
    return {
      title: "処理を完了できませんでした",
      message: ui.work.deliverableEmpty,
      action: "もう一度実行するか、依頼内容を具体化してください。",
    };
  }

  return {
    title: "予期しないエラー",
    message: "処理中に問題が発生しました。",
    action: "もう一度実行してください。改善しない場合はサポートへ連絡してください。",
  };
}

export function formatUserFacingErrorText(error: UserFacingError): string {
  return `${error.message}\n\n${error.action}`;
}
