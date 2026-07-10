import { beforeEach, describe, expect, it } from "vitest";

import {
  notifyAutomationCompleted,
  notifyXPostSuccess,
} from "./emitters";
import {
  createNotification,
  listUserNotifications,
  updateUserNotificationPreferences,
} from "./service";
import { resetNotificationStore } from "./store";

const TEST_USER = "user_notification_test";

describe("notifications", () => {
  beforeEach(() => {
    resetNotificationStore();
  });

  it("creates a user notification with required fields", () => {
    const record = createNotification({
      audience: "user",
      userId: TEST_USER,
      type: "completed",
      title: "テスト完了",
      message: "テストメッセージ",
      actionUrl: "/workspace",
    });

    expect(record).not.toBeNull();
    expect(record?.notificationId).toMatch(/^ntf_/);
    expect(record?.userId).toBe(TEST_USER);
    expect(record?.isRead).toBe(false);
    expect(listUserNotifications(TEST_USER)).toHaveLength(1);
  });

  it("skips notification when type preference is disabled", () => {
    updateUserNotificationPreferences(TEST_USER, {
      completedEnabled: false,
    });

    const record = notifyAutomationCompleted(TEST_USER, {
      automationId: "auto_1",
      name: "テスト自動化",
    });

    expect(record).toBeNull();
    expect(listUserNotifications(TEST_USER)).toHaveLength(0);
  });

  it("skips all notifications when master switch is off", () => {
    updateUserNotificationPreferences(TEST_USER, {
      allEnabled: false,
    });

    const record = notifyXPostSuccess(TEST_USER, "hello");

    expect(record).toBeNull();
    expect(listUserNotifications(TEST_USER)).toHaveLength(0);
  });

  it("creates owner notifications without user preferences", () => {
    const record = createNotification({
      audience: "owner",
      userId: null,
      type: "error",
      title: "Stripe Webhook失敗",
      message: "テスト障害",
      actionUrl: "/owner/billing-webhook",
    });

    expect(record).not.toBeNull();
    expect(record?.audience).toBe("owner");
  });
});
