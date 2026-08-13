import type { NotificationRecord } from "@/lib/notifications/types";

/**
 * Push tap destination. Prefer the exact work/run/approval screen.
 * Falls back to `/results/<notificationId>` which enforces ownership.
 * Never returns a bare home `/`.
 */
export function resolvePushClickPath(record: NotificationRecord): string {
  const notificationId = record.notificationId?.trim();
  const resultsFallback = notificationId
    ? `/results/${encodeURIComponent(notificationId)}`
    : "/notifications";

  if (record.targetType === "automation_run" && record.targetId?.trim()) {
    return `/automations/runs/${encodeURIComponent(record.targetId)}`;
  }
  if (record.targetType === "x_post" && record.targetId?.trim()) {
    return `/workspace/x?historyId=${encodeURIComponent(record.targetId)}`;
  }
  if (
    record.relatedService === "x" &&
    (record.requestId?.trim() || record.relatedTaskId?.trim())
  ) {
    const historyId = record.requestId?.trim() || record.relatedTaskId?.trim();
    return `/workspace/x?historyId=${encodeURIComponent(historyId!)}`;
  }
  if (record.targetType === "deliverable" && notificationId) {
    return resultsFallback;
  }

  const action = record.actionUrl?.trim() ?? "";
  if (action.startsWith("/") && action !== "/") {
    return action;
  }

  return resultsFallback;
}
