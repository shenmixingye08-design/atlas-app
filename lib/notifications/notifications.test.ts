import { beforeEach, describe, expect, it } from "vitest";

import {
  notifyAutomationCompleted,
  notifyWorkCompleted,
  notifyXPostSuccess,
} from "./emitters";
import { isSafeActionUrl } from "./display";
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

  it("deep-links a completed automation to its detail panel", () => {
    const record = notifyAutomationCompleted(TEST_USER, {
      automationId: "auto_42",
      name: "テスト自動化",
    });

    expect(record?.actionUrl).toBe("/automations?id=auto_42");
    expect(record?.relatedTaskId).toBe("auto_42");
    expect(isSafeActionUrl(record?.actionUrl)).toBe(true);
  });

  it("deep-links a successful X post to the exact post result", () => {
    const record = notifyXPostSuccess(TEST_USER, "hello", {
      historyId: "hist_7",
    });

    expect(record?.actionUrl).toBe("/workspace/x?historyId=hist_7");
    expect(record?.relatedTaskId).toBe("hist_7");
    expect(isSafeActionUrl(record?.actionUrl)).toBe(true);
  });

  it("gives an X post a task-type-specific title (not the generic one)", () => {
    const record = notifyXPostSuccess(TEST_USER, "hello", {
      historyId: "hist_8",
    });

    expect(record?.title).toBe("X自動投稿が完了しました");
    expect(record?.title).not.toBe("お仕事が完了しました");
  });

  it("keeps the caller's task-type title on completed work", () => {
    const record = notifyWorkCompleted(TEST_USER, {
      title: "レポートを作成しました",
      message: "ご確認をお願いいたします。",
      actionUrl: "/projects/commander-run_x",
      relatedTaskId: "commander-run_x",
    });

    expect(record?.title).toBe("レポートを作成しました");
  });

  it("persists deep-link targeting IDs on completed work", () => {
    const record = notifyWorkCompleted(TEST_USER, {
      title: "レポートを作成しました",
      message: "完了しました。",
      actionUrl: "/projects/commander-run_ids",
      relatedTaskId: "commander-run_ids",
      deliverableId: "commander-run_ids",
      workflowRunId: "wfr_42",
      requestId: "run_42",
    });

    expect(record?.deliverableId).toBe("commander-run_ids");
    expect(record?.workflowRunId).toBe("wfr_42");
    expect(record?.requestId).toBe("run_42");
  });

  it("derives the deep link from deliverableId when actionUrl is omitted", () => {
    const record = notifyWorkCompleted(TEST_USER, {
      title: "資料を作成しました",
      message: "完了しました。",
      deliverableId: "commander-run_auto",
    });

    expect(record?.actionUrl).toBe("/projects/commander-run_auto");
    expect(isSafeActionUrl(record?.actionUrl)).toBe(true);
    expect(record?.deliverableId).toBe("commander-run_auto");
  });

  it("deep-links completed work to the durable /projects result page", () => {
    const actionUrl = "/projects/commander-run_9";
    const record = notifyWorkCompleted(TEST_USER, {
      title: "完了",
      message: "完了しました",
      actionUrl,
      relatedTaskId: "commander-run_9",
    });

    expect(record?.actionUrl).toBe(actionUrl);
    expect(record?.relatedTaskId).toBe("commander-run_9");
    expect(isSafeActionUrl(record?.actionUrl)).toBe(true);
  });

  it("falls back to /workspace when no deep link is provided", () => {
    const record = notifyWorkCompleted(TEST_USER, {
      title: "完了",
      message: "完了しました",
    });

    expect(record?.actionUrl).toBe("/workspace");
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
