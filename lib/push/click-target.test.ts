import { describe, expect, it } from "vitest";

import type { NotificationRecord } from "@/lib/notifications/types";

import { resolvePushClickPath } from "./click-target";

function sample(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    notificationId: "ntf_1",
    userId: "user_1",
    audience: "user",
    type: "completed",
    title: "完了",
    message: "終わりました",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: "/workspace",
    ...overrides,
  };
}

describe("push tap destination", () => {
  it("15: work complete opens the results/deliverable route", () => {
    expect(
      resolvePushClickPath(
        sample({
          targetType: "deliverable",
          targetId: "del_1",
          actionUrl: "/projects/stale",
        }),
      ),
    ).toBe("/results/ntf_1");
  });

  it("15: automation run opens the exact run", () => {
    expect(
      resolvePushClickPath(
        sample({
          type: "error",
          targetType: "automation_run",
          targetId: "run_9",
          actionUrl: "/results/ntf_1",
        }),
      ),
    ).toBe("/automations/runs/run_9");
  });

  it("15: approval / input wait open the run review screen", () => {
    expect(
      resolvePushClickPath(
        sample({
          type: "awaiting_review",
          targetType: "automation_run",
          targetId: "run_wait",
        }),
      ),
    ).toBe("/automations/runs/run_wait");
  });

  it("never falls back to home /", () => {
    expect(resolvePushClickPath(sample({ actionUrl: "/" }))).toBe(
      "/results/ntf_1",
    );
    expect(resolvePushClickPath(sample({ actionUrl: null }))).toBe(
      "/results/ntf_1",
    );
  });
});
