"use client";

import { useMemo } from "react";

import {
  WORD_PROGRESS_LABELS,
  progressStepFromStage,
  type WordProgressStep,
} from "@/lib/deliverables/word-progress";
import {
  JOB_PROGRESS_LABELS,
  isJobProgressPhase,
  type JobProgressPhase,
} from "@/lib/work-jobs/progress";

type WordProgressStatusProps = {
  /** Word job stage — preferred when available. */
  stage?: string | null;
  /** Coarse progress phase from work-job API. */
  progressPhase?: JobProgressPhase | string | null;
  className?: string;
};

type WordJobStage =
  | "REQUEST_RECEIVED"
  | "AI_CONTENT_STARTED"
  | "AI_CONTENT_COMPLETED"
  | "DOCX_GENERATION_STARTED"
  | "DOCX_GENERATION_COMPLETED"
  | "DOCX_VERIFY_COMPLETED"
  | "DOCX_STORAGE_STARTED"
  | "DOCX_STORAGE_COMPLETED"
  | "METADATA_CREATED"
  | "DOWNLOAD_READY"
  | "NOTIFICATION_SENT"
  | "COMPLETED";

const WORD_JOB_STAGES: readonly WordJobStage[] = [
  "REQUEST_RECEIVED",
  "AI_CONTENT_STARTED",
  "AI_CONTENT_COMPLETED",
  "DOCX_GENERATION_STARTED",
  "DOCX_GENERATION_COMPLETED",
  "DOCX_VERIFY_COMPLETED",
  "DOCX_STORAGE_STARTED",
  "DOCX_STORAGE_COMPLETED",
  "METADATA_CREATED",
  "DOWNLOAD_READY",
  "NOTIFICATION_SENT",
  "COMPLETED",
];

function isWordJobStage(value: string | null | undefined): value is WordJobStage {
  return Boolean(value && WORD_JOB_STAGES.includes(value as WordJobStage));
}

/**
 * Displays the current progress label from real stage/phase data only.
 * Does not invent stages with timers.
 */
export function WordProgressStatus({
  stage = null,
  progressPhase = null,
  className,
}: WordProgressStatusProps) {
  const label = useMemo(() => {
    if (isWordJobStage(stage)) {
      return WORD_PROGRESS_LABELS[progressStepFromStage(stage)];
    }
    if (isJobProgressPhase(progressPhase)) {
      return JOB_PROGRESS_LABELS[progressPhase];
    }
    return WORD_PROGRESS_LABELS["confirming_request" satisfies WordProgressStep];
  }, [progressPhase, stage]);

  return (
    <p
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="word-progress-status"
    >
      {label}
    </p>
  );
}
