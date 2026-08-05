/**
 * P06: Fixed secretary loading / completion copy (no AI).
 * Always show a clear stage while work is in flight.
 */

export const OPS_PROGRESS_MESSAGES = {
  imageAnalyzing: "画像解析中...",
  aiThinking: "AIが考えています...",
  deliverableGenerating: "成果物生成中...",
  saving: "保存しています...",
  completed: "完了しました",
  retrying: "問題が発生しました。\n自動で再試行しています。",
} as const;

export type OpsProgressStage =
  | "image_analyzing"
  | "ai_thinking"
  | "deliverable_generating"
  | "saving"
  | "completed"
  | "retrying";

export function messageForOpsProgressStage(stage: OpsProgressStage): string {
  switch (stage) {
    case "image_analyzing":
      return OPS_PROGRESS_MESSAGES.imageAnalyzing;
    case "ai_thinking":
      return OPS_PROGRESS_MESSAGES.aiThinking;
    case "deliverable_generating":
      return OPS_PROGRESS_MESSAGES.deliverableGenerating;
    case "saving":
      return OPS_PROGRESS_MESSAGES.saving;
    case "completed":
      return OPS_PROGRESS_MESSAGES.completed;
    case "retrying":
      return OPS_PROGRESS_MESSAGES.retrying;
    default:
      return OPS_PROGRESS_MESSAGES.aiThinking;
  }
}

/** Canonical user-facing failure copy — never an error screen. */
export const USER_SOFT_RETRY_MESSAGE = OPS_PROGRESS_MESSAGES.retrying;
