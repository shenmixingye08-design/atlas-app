/**
 * Structured failure info for the trust UX:
 * cause / where it stopped / retry / auto-retry eligibility.
 */

import { isRetryableFailure, formatFailureReason } from "@/lib/orchestration/execution-reliability";

import {
  WORK_PROGRESS_STAGE_LABELS,
  type WorkProgressStageId,
  clampStage,
} from "./stages";

export type WorkFailureInfo = {
  cause: string;
  stoppedAtStage: WorkProgressStageId;
  stoppedAtLabel: string;
  canRetry: boolean;
  autoRetry: boolean;
  autoRetryMessage: string | null;
  attempt: number;
  maxAttempts: number;
};

export function buildWorkFailureInfo(input: {
  error: unknown;
  stoppedAtStage?: WorkProgressStageId | null;
  attempt?: number;
  maxAttempts?: number;
  autoRetrying?: boolean;
}): WorkFailureInfo {
  const cause = formatFailureReason(input.error);
  const stoppedAtStage = clampStage(input.stoppedAtStage ?? "executing");
  const attempt = input.attempt ?? 1;
  const maxAttempts = input.maxAttempts ?? 3;
  const canRetry = true;
  const retryable = isRetryableFailure(input.error);
  const autoRetry =
    Boolean(input.autoRetrying) || (retryable && attempt < maxAttempts);

  return {
    cause,
    stoppedAtStage,
    stoppedAtLabel: WORK_PROGRESS_STAGE_LABELS[stoppedAtStage],
    canRetry,
    autoRetry,
    autoRetryMessage: autoRetry
      ? `一時的な問題のため、自動で再試行します（${attempt}/${maxAttempts}）`
      : null,
    attempt,
    maxAttempts,
  };
}
