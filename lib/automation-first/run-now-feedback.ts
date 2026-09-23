import type { AutomationRunResult } from "@/lib/automations/types";

export type WorkActionFeedback = {
  tone: "success" | "warning" | "error";
  message: string;
};

/** Honest one-line result for "今すぐ実行" — mirrors the run status as returned. */
export function describeRunNowResult(
  result: Pick<AutomationRunResult, "status" | "error" | "deliverableCount">,
): WorkActionFeedback {
  if (result.status === "completed") {
    return {
      tone: "success",
      message:
        result.deliverableCount > 0
          ? `完了しました。成果物${result.deliverableCount}件をお届けしました`
          : "完了しました",
    };
  }
  if (result.status === "awaiting_approval") {
    return { tone: "warning", message: "実行前の確認が必要です。内容をご確認ください" };
  }
  return {
    tone: "error",
    message: result.error ? `実行できませんでした:${result.error}` : "実行できませんでした",
  };
}

export function describeActionError(error: unknown, fallback: string): WorkActionFeedback {
  const message = error instanceof Error && error.message ? error.message : fallback;
  return { tone: "error", message };
}
