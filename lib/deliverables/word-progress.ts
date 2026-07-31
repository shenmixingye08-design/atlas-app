/**
 * User-facing Word progress labels — no technical stage names.
 */

import type { WordJobStage } from "./word-job-stages";

export type WordProgressStep =
  | "confirming_request"
  | "creating_content"
  | "converting_word"
  | "verifying_file"
  | "saving"
  | "preparing_deliverable"
  | "completed";

export const WORD_PROGRESS_LABELS: Record<WordProgressStep, string> = {
  confirming_request: "内容を確認しています",
  creating_content: "資料を準備しています",
  converting_word: "処理を続けています",
  verifying_file: "仕上げています",
  saving: "処理を続けています",
  preparing_deliverable: "仕上げています",
  completed: "お仕事が終わりました",
};

export function progressStepFromStage(stage: WordJobStage): WordProgressStep {
  switch (stage) {
    case "REQUEST_RECEIVED":
      return "confirming_request";
    case "AI_CONTENT_STARTED":
      return "creating_content";
    case "AI_CONTENT_COMPLETED":
    case "DOCX_GENERATION_STARTED":
      return "converting_word";
    case "DOCX_GENERATION_COMPLETED":
    case "DOCX_VERIFY_COMPLETED":
      return "verifying_file";
    case "DOCX_STORAGE_STARTED":
    case "DOCX_STORAGE_COMPLETED":
      return "saving";
    case "METADATA_CREATED":
    case "DOWNLOAD_READY":
    case "NOTIFICATION_SENT":
      return "preparing_deliverable";
    case "COMPLETED":
      return "completed";
    default:
      return "confirming_request";
  }
}

export function userProgressFromStage(stage: WordJobStage): {
  step: WordProgressStep;
  label: string;
} {
  const step = progressStepFromStage(stage);
  return { step, label: WORD_PROGRESS_LABELS[step] };
}
