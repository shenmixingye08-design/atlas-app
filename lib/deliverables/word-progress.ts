/**
 * User-facing Word progress labels — must mirror real stages (no technical names).
 */

import type { WordJobStage } from "./word-job-stages";
import {
  JOB_PROGRESS_LABELS,
  progressPhaseFromWordStage,
  type JobProgressPhase,
} from "@/lib/work-jobs/progress";

export type WordProgressStep =
  | "confirming_request"
  | "creating_content"
  | "converting_word"
  | "verifying_file"
  | "saving"
  | "preparing_deliverable"
  | "completed";

/** Prefer JobProgressPhase labels for secretary UX; keep step map for legacy callers. */
export const WORD_PROGRESS_LABELS: Record<WordProgressStep, string> = {
  confirming_request: JOB_PROGRESS_LABELS.accepted,
  creating_content: JOB_PROGRESS_LABELS.ai_content,
  converting_word: JOB_PROGRESS_LABELS.generating,
  verifying_file: JOB_PROGRESS_LABELS.generating,
  saving: JOB_PROGRESS_LABELS.saving,
  preparing_deliverable: JOB_PROGRESS_LABELS.notifying,
  completed: JOB_PROGRESS_LABELS.completed,
};

export function progressStepFromStage(stage: WordJobStage): WordProgressStep {
  switch (stage) {
    case "REQUEST_RECEIVED":
      return "confirming_request";
    case "AI_CONTENT_STARTED":
    case "AI_CONTENT_COMPLETED":
      return "creating_content";
    case "DOCX_GENERATION_STARTED":
    case "DOCX_GENERATION_COMPLETED":
      return "converting_word";
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
  phase: JobProgressPhase;
} {
  const step = progressStepFromStage(stage);
  const phase = progressPhaseFromWordStage(stage);
  return { step, label: WORD_PROGRESS_LABELS[step], phase };
}
