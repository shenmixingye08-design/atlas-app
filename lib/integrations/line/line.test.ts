import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLineLinkCode, saveLineUserLink, resetLineLinkStore } from "./link-store";
import { formatLineNotificationText, isLineEventEnabled } from "./service";
import { resetNotificationStore, saveStoredPreferences } from "@/lib/notifications/store";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import { claimDailyDigest, resetLineDigestDedupe } from "./digest-dedupe";

describe("LINE notifications", () => {
  beforeEach(() => {
    resetLineLinkStore();
    resetNotificationStore();
    resetLineDigestDedupe();
  });

  it("formats LINE push text", () => {
    const text = formatLineNotificationText({
      title: "仕事完了",
      message: "資料が完成しました",
      actionUrl: "/workspace",
    });
    expect(text).toContain("【ATLAS】仕事完了");
    expect(text).toContain("資料が完成しました");
  });

  it("respects LINE event ON/OFF preferences", () => {
    const userId = "user_line_pref";
    saveStoredPreferences(userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, line: true },
      lineEvents: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents,
        mail_received: false,
      },
    });

    expect(isLineEventEnabled(userId, "work_completed")).toBe(true);
    expect(isLineEventEnabled(userId, "mail_received")).toBe(false);
  });

  it("links atlas user via code and dedupes daily digests", () => {
    const userId = "user_line_link";
    const code = createLineLinkCode(userId);
    expect(code.code).toMatch(/^\d{6}$/);

    saveLineUserLink({
      atlasUserId: userId,
      lineUserId: "U123",
      displayName: null,
      linkedAt: new Date().toISOString(),
    });

    expect(claimDailyDigest(userId, "morning_briefing")).toBe(true);
    expect(claimDailyDigest(userId, "morning_briefing")).toBe(false);
  });
});
