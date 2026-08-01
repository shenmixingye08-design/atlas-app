import "server-only";

import { notifyWorkFailed } from "@/lib/notifications/emitters";

/**
 * Ensure failed work jobs always surface in the notification bell —
 * even when the user closed the workspace tab.
 */
export function notifyWorkJobFailed(input: {
  userId: string;
  jobId: string;
  message: string;
  title?: string;
}): void {
  try {
    notifyWorkFailed(input.userId, {
      title: input.title ?? "お仕事を完了できませんでした",
      message: input.message,
      requestId: input.jobId,
      relatedTaskId: input.jobId,
      actionUrl: "/notifications",
    });
  } catch (error) {
    console.warn("[work-jobs] failure notification emit failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
