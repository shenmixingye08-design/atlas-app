/**
 * User-facing job progress — must mirror real pipeline stages (no fake rotation).
 */

import type { WordJobStage } from "@/lib/deliverables/word-job-stages";
import type { WordPipelineStage } from "@/lib/deliverables/pipeline-log";
import type { CanonicalJobStatus } from "./job-status";

/** Coarse progress phases shown after accept. */
export const JOB_PROGRESS_PHASES = [
  "accepted",
  "ai_content",
  "generating",
  "saving",
  "notifying",
  "completed",
  "failed",
] as const;

export type JobProgressPhase = (typeof JOB_PROGRESS_PHASES)[number];

/** Labels match the secretary UX copy (emoji + Japanese). */
export const JOB_PROGRESS_LABELS: Record<JobProgressPhase, string> = {
  accepted: "ご依頼を受け付けました",
  ai_content: "🧠 AIで内容作成中",
  generating: "📄 成果物生成中",
  saving: "☁ 保存中",
  notifying: "🔔 通知準備中",
  completed: "成果物が完成しました",
  failed: "処理を完了できませんでした",
};

/** After this elapsed time while still processing, show the “taking longer” banner. */
export const JOB_SLOW_THRESHOLD_MS = 90_000;

export const JOB_SLOW_BANNER =
  "通常より時間がかかっています。\n\n現在も処理は継続しています。\n\n完成しましたら通知いたします。";

export const JOB_ACCEPTED_TITLE = "かしこまりました。";
export const JOB_ACCEPTED_DESCRIPTION =
  "ご依頼を受け付けました。\n\n成果物が完成しましたら通知いたします。";

export function isJobProgressPhase(value: unknown): value is JobProgressPhase {
  return (
    typeof value === "string" &&
    (JOB_PROGRESS_PHASES as readonly string[]).includes(value)
  );
}

export function progressPhaseFromWordStage(
  stage: WordJobStage | null | undefined,
): JobProgressPhase {
  if (!stage) return "accepted";
  switch (stage) {
    case "REQUEST_RECEIVED":
      return "accepted";
    case "AI_CONTENT_STARTED":
    case "AI_CONTENT_COMPLETED":
      return "ai_content";
    case "DOCX_GENERATION_STARTED":
    case "DOCX_GENERATION_COMPLETED":
    case "DOCX_VERIFY_COMPLETED":
      return "generating";
    case "DOCX_STORAGE_STARTED":
    case "DOCX_STORAGE_COMPLETED":
    case "METADATA_CREATED":
    case "DOWNLOAD_READY":
      return "saving";
    case "NOTIFICATION_SENT":
      return "notifying";
    case "COMPLETED":
      return "completed";
    default:
      return "accepted";
  }
}

export function progressPhaseFromPipelineStage(
  stage: WordPipelineStage | string | null | undefined,
): JobProgressPhase | null {
  if (!stage) return null;
  switch (stage) {
    case "REQUEST_ACCEPTED":
    case "JOB_PERSISTED":
      return "accepted";
    case "AI_ORCHESTRATION_STARTED":
    case "AI_ORCHESTRATION_COMPLETED":
      return "ai_content";
    case "WORD_EXPORT_STARTED":
    case "DOCX_GENERATED":
      return "generating";
    case "STORAGE_SAVED":
    case "DB_METADATA_SAVED":
      return "saving";
    case "NOTIFICATION_CREATED":
    case "UNREAD_COUNT_READY":
      return "notifying";
    case "STATUS_COMPLETED":
      return "completed";
    case "FAILED":
    case "TIMEOUT":
      return "failed";
    default:
      return null;
  }
}

export function progressPhaseFromJobStatus(
  status: CanonicalJobStatus | string | null | undefined,
  current?: JobProgressPhase | null,
): JobProgressPhase {
  const s = (status ?? "").toLowerCase();
  if (s === "queued") return "accepted";
  if (s === "completed") return "completed";
  if (s === "failed" || s === "timed_out" || s === "cancelled") return "failed";
  if (s === "processing" || s === "running") {
    return current && current !== "completed" && current !== "failed"
      ? current
      : "ai_content";
  }
  return current ?? "accepted";
}

export function labelForProgressPhase(phase: JobProgressPhase): string {
  return JOB_PROGRESS_LABELS[phase];
}

export function computeJobElapsedMs(input: {
  createdAt?: string | null;
  startedAt?: string | null;
  nowMs?: number;
}): number {
  const anchor = input.startedAt || input.createdAt;
  if (!anchor) return 0;
  const ms = new Date(anchor).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, (input.nowMs ?? Date.now()) - ms);
}

export function isJobTakingLonger(input: {
  status: string | null | undefined;
  createdAt?: string | null;
  startedAt?: string | null;
  nowMs?: number;
  thresholdMs?: number;
}): boolean {
  const s = (input.status ?? "").toLowerCase();
  if (s !== "processing" && s !== "running" && s !== "queued") return false;
  return (
    computeJobElapsedMs(input) >=
    (input.thresholdMs ?? JOB_SLOW_THRESHOLD_MS)
  );
}
