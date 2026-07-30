import "server-only";

import { createNotification } from "./service";
import {
  listStoredNotifications,
  updateNotification,
} from "./store";
import type {
  NotificationRecord,
  WorkNotificationEvent,
} from "./types";
import { persistNotificationsNow } from "./durable";

/** Stable upsert key for one work job's lifecycle notifications. */
export function workJobNotificationRequestId(jobId: string): string {
  return `workjob:${jobId.trim()}`;
}

/** Stable upsert key for standalone Word engine jobs. */
export function wordJobNotificationRequestId(jobId: string): string {
  return `wordjob:${jobId.trim()}`;
}

function findByLifecycleKey(
  userId: string,
  requestId: string,
  jobId?: string | null,
): NotificationRecord | undefined {
  return listStoredNotifications({
    audience: "user",
    userId,
  }).find(
    (n) =>
      n.requestId === requestId ||
      (jobId && n.jobId === jobId) ||
      n.relatedTaskId === requestId,
  );
}

export type WorkLifecycleNotifyInput = {
  userId: string;
  jobId: string;
  event: WorkNotificationEvent;
  title: string;
  message: string;
  /** Project / results target id (commander-* / wordfile-*). */
  deliverableId?: string | null;
  /** Raw .docx artifact UUID when downloadable. */
  artifactId?: string | null;
  workflowRunId?: string | null;
  /** Override upsert key (default workjob:{jobId}). */
  requestId?: string | null;
  retryActionUrl?: string | null;
  /** Persist durable immediately (recommended for terminal events). */
  persist?: boolean;
};

function notificationTypeForEvent(
  event: WorkNotificationEvent,
): NotificationRecord["type"] {
  switch (event) {
    case "completed":
      return "completed";
    case "failed":
    case "timed_out":
      return "error";
    case "accepted":
    case "processing":
    case "retry_result":
      return "automation";
    default:
      return "automation";
  }
}

/**
 * Upsert one lifecycle notification per jobId.
 * Same job never creates unlimited duplicate rows across accepted→…→completed.
 */
export function notifyWorkLifecycle(
  input: WorkLifecycleNotifyInput,
): NotificationRecord | null {
  const jobId = input.jobId.trim();
  if (!input.userId || !jobId) return null;

  const requestId =
    input.requestId?.trim() || workJobNotificationRequestId(jobId);
  const deliverableId = input.deliverableId ?? null;
  const artifactId = input.artifactId ?? null;
  const retryActionUrl =
    input.retryActionUrl ??
    (input.event === "failed" ||
    input.event === "timed_out" ||
    input.event === "retry_result"
      ? "/workspace"
      : null);
  const type = notificationTypeForEvent(input.event);

  const existing = findByLifecycleKey(input.userId, requestId, jobId);

  // Never downgrade a completed notification with an artifact to a softer event.
  if (
    existing?.workEvent === "completed" &&
    existing.deliverableId &&
    input.event !== "completed" &&
    input.event !== "retry_result"
  ) {
    return existing;
  }

  if (existing) {
    const nextDeliverableId = deliverableId ?? existing.deliverableId ?? null;
    const updated = updateNotification(existing.notificationId, {
      type,
      title: input.title,
      message: input.message,
      workEvent: input.event,
      jobId,
      artifactId,
      deliverableId: nextDeliverableId,
      targetType: nextDeliverableId
        ? "deliverable"
        : existing.targetType ?? null,
      targetId: nextDeliverableId ?? existing.targetId ?? null,
      relatedTaskId: nextDeliverableId ?? existing.relatedTaskId ?? jobId,
      workflowRunId: input.workflowRunId ?? existing.workflowRunId ?? null,
      requestId,
      retryActionUrl,
      actionUrl: nextDeliverableId
        ? `/results/${encodeURIComponent(existing.notificationId)}`
        : existing.actionUrl,
      isRead: false,
      readAt: null,
      lineEvent:
        input.event === "completed"
          ? "work_completed"
          : input.event === "failed" || input.event === "timed_out"
            ? "error"
            : existing.lineEvent ?? null,
    });
    if (input.persist !== false) {
      void persistNotificationsNow(input.userId).catch(() => undefined);
    }
    return updated;
  }

  const created = createNotification({
    audience: "user",
    userId: input.userId,
    type,
    title: input.title,
    message: input.message,
    relatedTaskId: deliverableId ?? jobId,
    actionUrl: deliverableId
      ? `/projects/${encodeURIComponent(deliverableId)}`
      : `/workspace`,
    targetType: deliverableId ? "deliverable" : null,
    targetId: deliverableId,
    deliverableId,
    workflowRunId: input.workflowRunId ?? null,
    requestId,
    jobId,
    artifactId,
    workEvent: input.event,
    retryActionUrl,
    lineEvent:
      input.event === "completed"
        ? "work_completed"
        : input.event === "failed" || input.event === "timed_out"
          ? "error"
          : null,
  });

  if (input.persist !== false) {
    void persistNotificationsNow(input.userId).catch(() => undefined);
  }
  return created;
}

export function notifyWorkAccepted(input: {
  userId: string;
  jobId: string;
  assignment?: string | null;
}): NotificationRecord | null {
  return notifyWorkLifecycle({
    userId: input.userId,
    jobId: input.jobId,
    event: "accepted",
    title: "かしこまりました。ご依頼を受け付けました。",
    message: "成果物が完成しましたら通知いたします。",
    persist: true,
  });
}

export function notifyWorkProcessing(input: {
  userId: string;
  jobId: string;
  assignment?: string | null;
}): NotificationRecord | null {
  return notifyWorkLifecycle({
    userId: input.userId,
    jobId: input.jobId,
    event: "processing",
    title: "ご依頼を処理しています",
    message: "完了すると通知でお知らせします。",
    persist: false,
  });
}

export function notifyWorkTimedOut(input: {
  userId: string;
  jobId: string;
  message?: string | null;
  deliverableId?: string | null;
}): NotificationRecord | null {
  return notifyWorkLifecycle({
    userId: input.userId,
    jobId: input.jobId,
    event: "timed_out",
    title: "通常より時間がかかっています。",
    message:
      input.message?.trim() ||
      "処理を終了しました。必要に応じて再試行してください。",
    deliverableId: input.deliverableId,
    retryActionUrl: "/workspace",
    persist: true,
  });
}

/** Terminal success — exact secretary copy. */
export function notifyWorkLifecycleCompleted(input: {
  userId: string;
  jobId: string;
  deliverableId?: string | null;
  artifactId?: string | null;
  workflowRunId?: string | null;
  isRetry?: boolean;
}): NotificationRecord | null {
  return notifyWorkLifecycle({
    userId: input.userId,
    jobId: input.jobId,
    event: input.isRetry ? "retry_result" : "completed",
    title: "成果物が完成しました。",
    message: "通知から開いてダウンロードできます。",
    deliverableId: input.deliverableId,
    artifactId: input.artifactId,
    workflowRunId: input.workflowRunId,
    persist: true,
  });
}

/** Terminal failure — exact secretary copy. */
export function notifyWorkLifecycleFailed(input: {
  userId: string;
  jobId: string;
  detail?: string | null;
  deliverableId?: string | null;
  artifactId?: string | null;
  isRetry?: boolean;
}): NotificationRecord | null {
  const detail = input.detail?.trim();
  return notifyWorkLifecycle({
    userId: input.userId,
    jobId: input.jobId,
    event: input.isRetry ? "retry_result" : "failed",
    title: "申し訳ありません。",
    message: detail
      ? `生成中にエラーが発生しました。再試行できます。\n${detail.slice(0, 180)}`
      : "生成中にエラーが発生しました。再試行できます。",
    deliverableId: input.deliverableId,
    artifactId: input.artifactId,
    retryActionUrl: "/workspace",
    persist: true,
  });
}
