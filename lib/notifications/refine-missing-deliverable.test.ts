import { describe, expect, it } from "vitest";

import { refineMissingDeliverableCode } from "./resolve-deliverable-lookup";
import type { NotificationRecord } from "./types";

function sample(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    notificationId: "ntf_1",
    userId: "user_1",
    audience: "user",
    type: "error",
    title: "失敗",
    message: "失敗しました",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: null,
    ...overrides,
  };
}

const emptyTrace = {
  primaryTargetId: "commander-1",
  triedIds: ["commander-1"],
  wordFileFound: false,
  wordFileId: null,
  commanderStatus: null,
  workJobStatus: null,
};

describe("refineMissingDeliverableCode", () => {
  it("classifies timeout from notification title", () => {
    expect(
      refineMissingDeliverableCode({
        notification: sample({ title: "タイムアウト", message: "時間内に終わりませんでした" }),
        trace: emptyTrace,
      }),
    ).toBe("timeout");
  });

  it("classifies AI / Storage / notification failures", () => {
    expect(
      refineMissingDeliverableCode({
        notification: sample({ title: "AIエラー", message: "AI応答の作成で問題" }),
        trace: emptyTrace,
      }),
    ).toBe("ai_error");

    expect(
      refineMissingDeliverableCode({
        notification: sample({ title: "保存失敗", message: "Storageへの保存に失敗" }),
        trace: emptyTrace,
      }),
    ).toBe("storage_failed");

    expect(
      refineMissingDeliverableCode({
        notification: sample({ title: "通知失敗", message: "notification_emit_failed" }),
        trace: emptyTrace,
      }),
    ).toBe("notification_failed");
  });

  it("reports pending while work job is still running", () => {
    expect(
      refineMissingDeliverableCode({
        notification: sample({ type: "info", title: "処理中" }),
        trace: { ...emptyTrace, workJobStatus: "running" },
      }),
    ).toBe("pending");
  });
});
