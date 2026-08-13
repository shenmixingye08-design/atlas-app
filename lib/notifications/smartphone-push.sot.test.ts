import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const pushDeliveries: Array<{
  userId: string;
  notificationId: string;
  title: string;
}> = [];

vi.mock("@/lib/notifications/delivery", () => ({
  deliverLineWithAck: vi.fn(async () => ({
    ok: true,
    status: "skipped" as const,
    attempts: 1,
    sentCount: 0,
    skipReason: "not_configured",
    error: null,
    softSuccess: false as const,
  })),
  deliverWebPushWithAck: vi.fn(async (input: {
    record: { userId: string | null; notificationId: string; title: string };
  }) => {
    if (input.record.userId) {
      pushDeliveries.push({
        userId: input.record.userId,
        notificationId: input.record.notificationId,
        title: input.record.title,
      });
    }
    return {
      ok: true,
      status: "delivered" as const,
      attempts: 1,
      sentCount: 1,
      skipReason: null,
      error: null,
      softSuccess: false as const,
    };
  }),
}));

import { notifyWorkCompleted } from "@/lib/notifications/emitters";
import { resetDurableInboxForTests } from "@/lib/notifications/durable-inbox";
import {
  createNotification,
  listUserNotifications,
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import { deliverWebPushWithAck } from "@/lib/notifications/delivery";
import { artifactCompletedCopy } from "@/lib/notifications/user-facing-copy";

const USER_A = "user_push_a";
const USER_B = "user_push_b";

const POLICY = {
  beforeRun: false,
  onSuccess: true,
  onFailure: true,
  onNeedsInput: true,
  channels: ["in_app" as const, "web_push" as const],
};

function sampleRun(id: string, userId: string): AutomationRun {
  return {
    id,
    automationId: "auto_1",
    userId,
    status: "succeeded",
    steps: [
      {
        id: "s1",
        capabilityId: "x_post",
        name: "X投稿",
        order: 0,
        status: "succeeded",
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      },
    ],
  } as AutomationRun;
}

describe("smartphone notification SoT", () => {
  beforeEach(() => {
    resetNotificationStore();
    resetDurableInboxForTests();
    pushDeliveries.length = 0;
    vi.mocked(deliverWebPushWithAck).mockClear();
    updateUserNotificationPreferences(USER_A, {
      allEnabled: true,
      channels: { push: true, inApp: true, email: false, line: false, slack: false },
    });
    updateUserNotificationPreferences(USER_B, {
      allEnabled: true,
      channels: { push: true, inApp: true, email: false, line: false, slack: false },
    });
  });

  it("8: 仕事完了通知", async () => {
    const copy = artifactCompletedCopy("excel", "売上.xlsx");
    const record = await notifyWorkCompleted(USER_A, {
      title: copy.title,
      message: copy.message,
      deliverableId: "del_excel",
      requestId: "req_excel",
    });
    expect(record?.title).toBe("Excelファイルが完成しました");
    expect(record?.type).toBe("completed");
    expect(record?.actionUrl).toBe(`/results/${record?.notificationId}`);
    expect(pushDeliveries.some((d) => d.userId === USER_A)).toBe(true);
  });

  it("9–12: automation complete / fail / approval / input", async () => {
    const run = sampleRun("run_sot", USER_A);
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run: { ...run, status: "succeeded" },
      policy: POLICY,
      event: "succeeded",
    });
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run: { ...run, id: "run_fail", status: "failed" },
      policy: POLICY,
      event: "failed",
    });
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run: { ...run, id: "run_appr", status: "awaiting_approval" },
      policy: POLICY,
      event: "awaiting_approval",
    });
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run: { ...run, id: "run_input", status: "needs_input" },
      policy: POLICY,
      event: "needs_input",
    });

    const inbox = await listUserNotifications(USER_A);
    const titles = inbox.map((n) => n.title);
    expect(titles).toContain("Xへの投稿が完了しました");
    expect(titles).toContain("X投稿に失敗しました");
    expect(titles).toContain("実行前の確認が必要です");
    expect(titles).toContain("MINERVOTが追加情報を待っています");
    expect(titles.join(" ")).not.toMatch(/automation_run_failed|needs_input|awaiting_approval/);
    expect(inbox.every((n) => n.actionUrl?.includes("/results/") || n.targetType === "automation_run")).toBe(true);
    expect(inbox.every((n) => n.targetType === "automation_run")).toBe(true);
  });

  it("13: same run + same event is not duplicated", async () => {
    const run = sampleRun("run_dup", USER_A);
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run,
      policy: POLICY,
      event: "succeeded",
    });
    await notifyAutomationRunEvent({
      userId: USER_A,
      automationName: "週次X投稿",
      run,
      policy: POLICY,
      event: "succeeded",
    });
    const inbox = await listUserNotifications(USER_A);
    expect(inbox).toHaveLength(1);
    expect(pushDeliveries.filter((d) => d.userId === USER_A)).toHaveLength(1);
  });

  it("14: another user never receives the notification", async () => {
    await notifyWorkCompleted(USER_A, {
      title: "Excelファイルが完成しました",
      message: "完成しました",
      deliverableId: "del_iso",
      requestId: "req_iso",
    });
    expect(await listUserNotifications(USER_B)).toHaveLength(0);
    expect(pushDeliveries.every((d) => d.userId === USER_A)).toBe(true);
    expect(pushDeliveries.some((d) => d.userId === USER_B)).toBe(false);
  });

  it("16: in-app still created alongside push", async () => {
    const record = await createNotification({
      audience: "user",
      userId: USER_A,
      type: "completed",
      title: "仕事が完了しました",
      message: "ご確認ください",
      requestId: "req_inapp",
    });
    expect(record).not.toBeNull();
    expect(await listUserNotifications(USER_A)).toHaveLength(1);
    expect(pushDeliveries).toHaveLength(1);
  });

  it("push still sends when in-app type is disabled", async () => {
    updateUserNotificationPreferences(USER_A, {
      completedEnabled: false,
      channels: { push: true, inApp: true, email: false, line: false, slack: false },
    });
    const record = await createNotification({
      audience: "user",
      userId: USER_A,
      type: "completed",
      title: "Excelファイルが完成しました",
      message: "完成しました",
      requestId: "req_push_only",
    });
    expect(record).toBeNull();
    expect(await listUserNotifications(USER_A)).toHaveLength(0);
    expect(pushDeliveries).toHaveLength(1);
  });
});
