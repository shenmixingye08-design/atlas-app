import { describe, expect, it } from "vitest";

import { decideNotificationResult } from "./result-resolution";
import type { NotificationRecord } from "./types";

function sample(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
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
    actionUrl: null,
    ...overrides,
  };
}

describe("decideNotificationResult", () => {
  it("404s when the notification does not exist", () => {
    expect(
      decideNotificationResult({ notification: null, requesterUserId: "user_1" }),
    ).toEqual({ status: "error", code: "not_found", http: 404 });
  });

  it("403s on cross-user access (ownership isolation)", () => {
    expect(
      decideNotificationResult({
        notification: sample({ userId: "owner_9", deliverableId: "commander-1" }),
        requesterUserId: "attacker_1",
      }),
    ).toEqual({ status: "error", code: "forbidden", http: 403 });
  });

  it("returns 旧形式 (legacy) when there is no target id", () => {
    expect(
      decideNotificationResult({
        notification: sample({ actionUrl: "/workspace" }),
        requesterUserId: "user_1",
      }),
    ).toEqual({ status: "error", code: "legacy", http: 200 });
  });

  it("renders the deliverable when it is saved and ready", () => {
    expect(
      decideNotificationResult({
        notification: sample({
          targetType: "deliverable",
          targetId: "commander-1",
        }),
        requesterUserId: "user_1",
        lookup: { durable: true, found: true, displayKind: "ready" },
      }),
    ).toEqual({
      status: "deliverable",
      targetType: "deliverable",
      targetId: "commander-1",
    });
  });

  it("reports not_saved when notified but the 成果物 was never persisted (order)", () => {
    expect(
      decideNotificationResult({
        notification: sample({ deliverableId: "commander-2" }),
        requesterUserId: "user_1",
        lookup: { durable: true, found: false },
      }),
    ).toEqual({ status: "error", code: "not_saved", http: 200 });
  });

  it("reports generation_failed / pending from the display state", () => {
    expect(
      decideNotificationResult({
        notification: sample({ deliverableId: "commander-3" }),
        requesterUserId: "user_1",
        lookup: { durable: true, found: true, displayKind: "failed" },
      }),
    ).toEqual({ status: "error", code: "generation_failed", http: 200 });

    expect(
      decideNotificationResult({
        notification: sample({ deliverableId: "commander-4" }),
        requesterUserId: "user_1",
        lookup: { durable: true, found: true, displayKind: "generating" },
      }),
    ).toEqual({ status: "error", code: "pending", http: 200 });
  });

  it("falls back to client cache (unavailable) when no durable backend", () => {
    expect(
      decideNotificationResult({
        notification: sample({ deliverableId: "commander-5" }),
        requesterUserId: "user_1",
        lookup: { durable: false },
      }),
    ).toEqual({
      status: "unavailable",
      targetType: "deliverable",
      targetId: "commander-5",
    });
  });

  it("redirects automation / X post targets to their working detail view", () => {
    expect(
      decideNotificationResult({
        notification: sample({ automationId: "auto_7" }),
        requesterUserId: "user_1",
      }),
    ).toEqual({ status: "redirect", url: "/automations?id=auto_7" });

    expect(
      decideNotificationResult({
        notification: sample({ relatedService: "x", requestId: "hist_2" }),
        requesterUserId: "user_1",
      }),
    ).toEqual({ status: "redirect", url: "/workspace/x?historyId=hist_2" });
  });
});
