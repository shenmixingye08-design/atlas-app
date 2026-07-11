import { describe, expect, it } from "vitest";

import type { Automation } from "@/lib/automations/types";
import type { NotificationRecord } from "@/lib/notifications/types";
import type { Project } from "@/lib/projects/types";

import { buildSecretaryMemoryItems } from "./secretary-memory";

function project(partial: Partial<Project> & Pick<Project, "id" | "title" | "status">): Project {
  return {
    workRequest: partial.workRequest ?? partial.title,
    progress: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-07-10T00:00:00.000Z",
    assignedEmployees: [],
    result: null,
    ...partial,
  };
}

function automation(partial: Partial<Automation> & Pick<Automation, "id" | "name">): Automation {
  return {
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    },
    workflow: { assignment: partial.workflow?.assignment ?? "習慣の仕事" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "draft_save",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "generic", steps: [] },
    enabled: true,
    lastRun: null,
    nextRun: "2026-07-11T00:00:00.000Z",
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildSecretaryMemoryItems", () => {
  it("returns empty when no data exists", () => {
    expect(
      buildSecretaryMemoryItems({
        projects: [],
        automations: [],
        notifications: [],
      }),
    ).toEqual([]);
  });

  it("prioritizes incomplete work over recent, habits, and notices", () => {
    const items = buildSecretaryMemoryItems({
      projects: [
        project({
          id: "p-done",
          title: "完了した請求書",
          status: "completed",
          workRequest: "請求書を作成",
          updatedAt: "2026-07-10T12:00:00.000Z",
        }),
        project({
          id: "p-review",
          title: "営業資料",
          status: "review",
          workRequest: "営業資料を作成",
          updatedAt: "2026-07-10T10:00:00.000Z",
        }),
      ],
      automations: [automation({ id: "a1", name: "SNS投稿" })],
      notifications: [
        {
          notificationId: "n1",
          userId: "u1",
          audience: "user",
          type: "recommendation",
          title: "お知らせ",
          message: "改善案があります",
          relatedTaskId: null,
          relatedService: null,
          isRead: false,
          createdAt: "2026-07-10T09:00:00.000Z",
          actionUrl: null,
        } satisfies NotificationRecord,
      ],
    });

    expect(items).toHaveLength(3);
    expect(items[0]?.id).toBe("incomplete-p-review");
    expect(items[0]?.message).toContain("営業資料");
    expect(items[1]?.priority).toBe(2);
    expect(items[2]?.priority).toBe(3);
  });
});
