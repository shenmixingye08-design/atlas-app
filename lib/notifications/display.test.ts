import { describe, expect, it } from "vitest";

import {
  formatNoticeMessage,
  formatNoticeTitle,
  isSafeActionUrl,
  matchesNoticeFilter,
  resolveNoticeCategory,
  resolveNoticePriority,
} from "./display";
import type { NotificationRecord } from "./types";

function sample(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    notificationId: "ntf_1",
    userId: "user_1",
    audience: "user",
    type: "completed",
    title: "完了",
    message: "作業が終わりました",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: "/workspace",
    ...overrides,
  };
}

describe("notification display", () => {
  it("maps types to secretary categories", () => {
    expect(resolveNoticeCategory(sample({ type: "awaiting_review" }))).toBe(
      "needs_review",
    );
    expect(resolveNoticeCategory(sample({ type: "recommendation" }))).toBe(
      "improvement",
    );
    expect(resolveNoticeCategory(sample({ type: "billing" }))).toBe("ops");
    expect(
      resolveNoticeCategory(
        sample({
          type: "completed",
          message: "追加の資料をご提供ください",
        }),
      ),
    ).toBe("needs_material");
  });

  it("keeps urgent priority rare", () => {
    expect(
      resolveNoticePriority(
        sample({
          type: "error",
          title: "失敗",
          message: "処理を完了できませんでした",
        }),
      ),
    ).toBe("urgent");
    expect(
      resolveNoticePriority(sample({ type: "completed" })),
    ).toBe("normal");
  });

  it("formats secretary tone titles", () => {
    expect(
      formatNoticeTitle(sample({ type: "awaiting_review" })),
    ).toContain("ご確認");
    expect(formatNoticeMessage(sample({ type: "error" }))).toContain(
      "ご確認ください",
    );
  });

  it("blocks unsafe action urls", () => {
    expect(isSafeActionUrl("/workspace")).toBe(true);
    expect(isSafeActionUrl("/owner/system-status")).toBe(false);
    expect(isSafeActionUrl("https://evil.example")).toBe(false);
  });

  it("filters unread and categories", () => {
    const unread = sample({ isRead: false, type: "error" });
    expect(matchesNoticeFilter(unread, "unread")).toBe(true);
    expect(matchesNoticeFilter(unread, "error")).toBe(true);
    expect(matchesNoticeFilter(unread, "completed")).toBe(false);
  });
});
