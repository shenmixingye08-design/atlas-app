import { describe, expect, it } from "vitest";

import { candidateProjectIdsForNotification } from "./resolve-deliverable-lookup";
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

describe("candidateProjectIdsForNotification", () => {
  it("adds commander-{requestId} when Word UUID was stored as deliverableId", () => {
    const ids = candidateProjectIdsForNotification(
      sample({
        deliverableId: "c4ac3465-532b-4106-9513-b1ef5346020a",
        requestId: "run_abc",
      }),
      "c4ac3465-532b-4106-9513-b1ef5346020a",
    );
    expect(ids[0]).toBe("c4ac3465-532b-4106-9513-b1ef5346020a");
    expect(ids).toContain("commander-run_abc");
  });

  it("keeps commander project id first when already correct", () => {
    const ids = candidateProjectIdsForNotification(
      sample({
        deliverableId: "commander-run_1",
        requestId: "run_1",
      }),
      "commander-run_1",
    );
    expect(ids[0]).toBe("commander-run_1");
  });
});
