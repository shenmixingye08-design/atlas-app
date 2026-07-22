import { describe, expect, it } from "vitest";

import {
  countUnreadNotifications,
  isNotificationUnread,
  shouldDecrementUnreadCount,
} from "./unread-rules";
import type { NotificationRecord } from "./types";

function notice(isRead: boolean): NotificationRecord {
  return {
    notificationId: "n1",
    userId: "u1",
    audience: "user",
    type: "completed",
    title: "t",
    message: "m",
    relatedTaskId: null,
    relatedService: null,
    isRead,
    createdAt: "2026-07-22T00:00:00.000Z",
    actionUrl: null,
    lineEvent: null,
    targetType: null,
    targetId: null,
    workflowRunId: null,
    deliverableId: null,
    requestId: null,
    automationId: null,
    severity: null,
    eventCategory: null,
    pushSentAt: null,
    pushFailedAt: null,
    pushFailureReason: null,
    readAt: isRead ? "2026-07-22T00:00:00.000Z" : null,
  };
}

describe("notification unread rules", () => {
  it("counts only unread records", () => {
    expect(countUnreadNotifications([notice(false), notice(true)])).toBe(1);
  });

  it("marks single record read without affecting others", () => {
    expect(isNotificationUnread(notice(false))).toBe(true);
    expect(shouldDecrementUnreadCount(notice(false))).toBe(true);
    expect(shouldDecrementUnreadCount(notice(true))).toBe(false);
  });
});
