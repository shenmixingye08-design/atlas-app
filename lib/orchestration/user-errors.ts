import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { ui } from "@/lib/i18n";

import type { OrchestrationResult } from "./types";

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
      title: "もう少し時間がかかりそうです",
      message: "自動で再試行しています。しばらくしてからもう一度お試しください。",
      action: "内容を短くして送り直すと、より確実です。",
    };
  }

  if (/limit exceeded|workflow_limit|quota|rate limit|429/i.test(raw)) {
    return {
      title: "少し休憩が必要です",
      message: "安全のため、いったん作業を止めました。",
      action: "しばらくしてから、もう一度お試しください。",
    };
  }

  if (/OPENAI_API_KEY|AI service is not configured/i.test(raw)) {
    return {
      title: "確認が必要です",
      message: "ただいま準備の整っていない状態です。自動で復旧を試しています。",
      action: "しばらくしてからもう一度お試しください。",
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
      title: "処理中にエラーが発生しました",
      message: ui.work.deliverableEmpty,
      action: "もう一度実行するか、依頼内容を具体化してください。",
    };
  }

  return {
    title: "確認が必要です",
    message: toHumanReliabilityMessage(raw || "unknown"),
    action: "そのままお待ちいただくか、もう一度お試しください。",
  };
}

export function formatUserFacingErrorText(error: UserFacingError): string {
  const message = toHumanReliabilityMessage(error.message);
  const action = toHumanReliabilityMessage(error.action);
  return `${message}\n\n${action}`;
}
