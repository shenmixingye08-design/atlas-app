import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/push/vapid", () => ({
  isWebPushConfigured: () => true,
  getVapidPublicKey: () => "public",
  getVapidPrivateKey: () => "private",
  getVapidSubject: () => "mailto:ops@example.com",
  logVapidConfigIssues: () => ({
    configured: true,
    hasPublicKey: true,
    hasPrivateKey: true,
    hasSubject: true,
    missing: [],
    errorCode: null,
  }),
}));

import webpush from "web-push";

import type { NotificationRecord } from "@/lib/notifications/types";
import { updateUserNotificationPreferences } from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import { dispatchWebPushNotification } from "./dispatch";
import {
  resetPushSubscriptionStoreForTests,
  upsertPushSubscription,
} from "./subscription-store";

const sendNotification = vi.mocked(webpush.sendNotification);

function record(userId: string, id: string): NotificationRecord {
  return {
    notificationId: id,
    userId,
    audience: "user",
    type: "completed",
    title: "Excelファイルが完成しました",
    message: "ご確認ください",
    relatedTaskId: "del_1",
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: `/results/${id}`,
    targetType: "deliverable",
    targetId: "del_1",
    eventCategory: "final_success",
    severity: "important",
  };
}

describe("web push dispatch isolation", () => {
  beforeEach(() => {
    resetNotificationStore();
    resetPushSubscriptionStoreForTests();
    sendNotification.mockClear();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.minervot.example";
    updateUserNotificationPreferences("user_a", {
      channels: {
        push: true,
        inApp: true,
        email: false,
        line: false,
        slack: false,
      },
    });
    updateUserNotificationPreferences("user_b", {
      channels: {
        push: true,
        inApp: true,
        email: false,
        line: false,
        slack: false,
      },
    });
  });

  it("14: never sends user A payload to user B endpoint", async () => {
    await upsertPushSubscription({
      userId: "user_a",
      endpoint: "https://push.example/a",
      p256dh: "a_p256",
      authKey: "a_auth",
    });
    await upsertPushSubscription({
      userId: "user_b",
      endpoint: "https://push.example/b",
      p256dh: "b_p256",
      authKey: "b_auth",
    });

    await dispatchWebPushNotification({
      userId: "user_a",
      record: record("user_a", "ntf_a"),
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const firstCall = sendNotification.mock.calls[0];
    expect(firstCall).toBeDefined();
    const target = firstCall?.[0] as { endpoint?: string };
    expect(target.endpoint).toBe("https://push.example/a");
    expect(target.endpoint).not.toBe("https://push.example/b");
    const payload = JSON.parse(String(firstCall?.[1] ?? "{}")) as {
      targetUrl?: string;
    };
    expect(payload.targetUrl).toContain("/results/ntf_a");
    expect(payload.targetUrl).not.toContain("user_b");
  });
});
