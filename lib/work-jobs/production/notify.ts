import "server-only";

import { createNotification } from "@/lib/notifications/service";
import type { NotificationRecord } from "@/lib/notifications/types";
import type { WorkJobRecord } from "@/lib/work-jobs/store";

export type JobLifecycleEvent =
  | "start"
  | "progress"
  | "completed"
  | "failed"
  | "needs_input"
  | "retry"
  | "cancelled";

const recentKeys = new Map<string, number>();
const DEDUPE_MS = 60_000;

function dedupeKey(userId: string, jobId: string, event: JobLifecycleEvent): string {
  return `${userId}:${jobId}:${event}`;
}

/**
 * Prevent duplicate lifecycle notifications within a short window.
 * Progress is further rate-limited (only every 30s per job).
 */
export function shouldEmitJobNotification(
  userId: string,
  jobId: string,
  event: JobLifecycleEvent,
  nowMs = Date.now(),
): boolean {
  const key = dedupeKey(userId, jobId, event);
  const prev = recentKeys.get(key);
  const window = event === "progress" ? 30_000 : DEDUPE_MS;
  if (prev != null && nowMs - prev < window) return false;
  recentKeys.set(key, nowMs);
  // Bound map size
  if (recentKeys.size > 5_000) {
    for (const [k, ts] of recentKeys) {
      if (nowMs - ts > DEDUPE_MS * 2) recentKeys.delete(k);
    }
  }
  return true;
}

export function resetJobNotificationDedupeForTests(): void {
  recentKeys.clear();
}

function titleFor(event: JobLifecycleEvent): string {
  switch (event) {
    case "start":
      return "お仕事を開始しました";
    case "progress":
      return "お仕事の進捗";
    case "completed":
      return "お仕事が完了しました";
    case "failed":
      return "お仕事を完了できませんでした";
    case "needs_input":
      return "確認が必要です";
    case "retry":
      return "再試行しています";
    case "cancelled":
      return "お仕事をキャンセルしました";
  }
}

function typeFor(
  event: JobLifecycleEvent,
): NotificationRecord["type"] {
  switch (event) {
    case "completed":
      return "completed";
    case "failed":
      return "error";
    case "needs_input":
      return "awaiting_review";
    default:
      return "automation";
  }
}

/**
 * Emit job lifecycle notification (in-app; Push via existing delivery pipeline).
 * Email channel is recorded as intent only (no SMTP in this change set).
 */
export function emitJobLifecycleNotification(input: {
  job: WorkJobRecord;
  event: JobLifecycleEvent;
  message?: string | null;
}): {
  notification: NotificationRecord | null;
  channels: { inApp: boolean; push: boolean; email: "skipped_no_provider" };
  deduped: boolean;
} {
  const { job, event } = input;
  if (!shouldEmitJobNotification(job.userId, job.id, event)) {
    return {
      notification: null,
      channels: { inApp: false, push: false, email: "skipped_no_provider" },
      deduped: true,
    };
  }

  const message =
    input.message?.trim() ||
    job.currentStep ||
    job.error ||
    titleFor(event);

  // completed/failed may already be emitted by Commander — only emit
  // start/progress/retry/needs_input/cancelled from the job layer by default.
  // completed/failed are allowed when explicitly requested (e.g. durability).
  const notification = createNotification({
    audience: "user",
    userId: job.userId,
    type: typeFor(event),
    title: titleFor(event),
    message,
    relatedTaskId: job.id,
    actionUrl: "/workspace",
    requestId: job.requestId ?? job.id,
    targetType: "request",
    targetId: job.id,
  });

  return {
    notification,
    channels: {
      inApp: true,
      push: true,
      email: "skipped_no_provider",
    },
    deduped: false,
  };
}
