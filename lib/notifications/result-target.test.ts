import { describe, expect, it } from "vitest";

import {
  hasResolvableResultTarget,
  isDeliverableTargetType,
  resolveNotificationTarget,
} from "./result-target";
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

describe("resolveNotificationTarget", () => {
  it("prefers an explicit targetType + targetId", () => {
    expect(
      resolveNotificationTarget(
        sample({ targetType: "deliverable", targetId: "commander-1" }),
      ),
    ).toEqual({ kind: "deliverable", targetId: "commander-1" });
  });

  it("infers a deliverable from deliverableId (legacy row)", () => {
    expect(
      resolveNotificationTarget(sample({ deliverableId: "orchestrate-9" })),
    ).toEqual({ kind: "deliverable", targetId: "orchestrate-9" });
  });

  it("infers an x_post from the X service + history id", () => {
    expect(
      resolveNotificationTarget(
        sample({ relatedService: "x", requestId: "hist_7" }),
      ),
    ).toEqual({ kind: "x_post", targetId: "hist_7" });
  });

  it("infers an automation_run from automationId", () => {
    expect(
      resolveNotificationTarget(sample({ automationId: "auto_3" })),
    ).toEqual({ kind: "automation_run", targetId: "auto_3" });
  });

  it("infers a deliverable from a project-shaped relatedTaskId", () => {
    expect(
      resolveNotificationTarget(sample({ relatedTaskId: "commander-run_5" })),
    ).toEqual({ kind: "deliverable", targetId: "commander-run_5" });
  });

  it("returns none for a legacy row with no target ids", () => {
    expect(
      resolveNotificationTarget(sample({ actionUrl: "/workspace" })),
    ).toEqual({ kind: "none" });
  });

  it("classifies deliverable-family target types", () => {
    expect(isDeliverableTargetType("deliverable")).toBe(true);
    expect(isDeliverableTargetType("workflow_run")).toBe(true);
    expect(isDeliverableTargetType("analysis")).toBe(true);
    expect(isDeliverableTargetType("automation_run")).toBe(false);
    expect(isDeliverableTargetType("x_post")).toBe(false);
  });
});

describe("hasResolvableResultTarget", () => {
  it("is true for deliverable rows", () => {
    expect(hasResolvableResultTarget(sample({ deliverableId: "commander-1" }))).toBe(
      true,
    );
    expect(
      hasResolvableResultTarget(
        sample({ targetType: "deliverable", targetId: "commander-1" }),
      ),
    ).toBe(true);
  });

  it("is false for automation-only and target-less rows", () => {
    // Automation notifications keep their working panel deep link.
    expect(hasResolvableResultTarget(sample({ automationId: "auto_1" }))).toBe(
      false,
    );
    expect(hasResolvableResultTarget(sample({ actionUrl: "/workspace" }))).toBe(
      false,
    );
  });
});
