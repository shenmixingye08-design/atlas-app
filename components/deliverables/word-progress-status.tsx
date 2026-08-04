"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WORD_PROGRESS_LABELS,
  progressStepFromStage,
  type WordProgressStep,
} from "@/lib/deliverables/word-progress";

type WordProgressStatusProps = {
  stage?: string | null;
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

const WORD_PROGRESS_SEQUENCE: WordProgressStep[] = [
  "confirming_request",
  "creating_content",
  "converting_word",
  "verifying_file",
  "saving",
  "preparing_deliverable",
];

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

export function WordProgressStatus({
  stage = null,
  className,
}: WordProgressStatusProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (stage) return;
    const timer = window.setInterval(() => {
      setIndex((current) =>
        Math.min(current + 1, WORD_PROGRESS_SEQUENCE.length - 1),
      );
    }, 2_800);
    return () => window.clearInterval(timer);
  }, [stage]);

  const label = useMemo(() => {
    if (isWordJobStage(stage)) {
      return WORD_PROGRESS_LABELS[progressStepFromStage(stage)];
    }
    return WORD_PROGRESS_LABELS[WORD_PROGRESS_SEQUENCE[index] ?? "confirming_request"];
  }, [index, stage]);

  return (
    <p
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {label}
    </p>
  );
}
