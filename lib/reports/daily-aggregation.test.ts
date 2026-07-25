import { describe, expect, it } from "vitest";

import type { NotificationRecord } from "@/lib/notifications/types";
import {
  aggregateDailyReport,
  formatDailyReportPushBody,
} from "@/lib/reports/daily-aggregation";

function n(partial: Partial<NotificationRecord>): NotificationRecord {
  return {
    notificationId: "ntf_test",
    userId: "user",
    audience: "user",
    type: "completed",
    title: "t",
    message: "m",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: null,
    ...partial,
  };
}

describe("daily aggregation", () => {
  it("counts completed notifications for today", () => {
    const section = aggregateDailyReport({
      notifications: [n({ type: "completed" }), n({ type: "error" })],
    });
    expect(section.completedCount).toBe(1);
    expect(section.failedCount).toBe(1);
    expect(formatDailyReportPushBody(section)).toContain("完了");
  });
});
