import { describe, expect, it } from "vitest";

import type { Automation } from "@/lib/automations/types";

import {
  countSuccessfulFinishedWorkThisMonth,
  formatFinishedWorkThisMonthLine,
} from "./finished-work";

function sample(status: Automation["status"], lastRun: string): Automation {
  return {
    id: status,
    userId: "u",
    name: "週次営業資料",
    description: "毎週の営業資料",
    enabled: true,
    status,
    schedule: {
      kind: "schedule",
      preset: { type: "weekly", dayOfWeek: 5, hour: 18, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎週金曜 18:00",
    },
    workflow: { assignment: "営業資料を作る" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: {
      templateId: "sales_material",
      steps: [{ id: "draft", enabled: true }],
    },
    destination: "none",
    lastRun,
    nextRun: null,
    lastWorkflowRunId: null,
    lastError: null,
    successCount: status === "success" ? 1 : 0,
    failureCount: status === "failed" ? 1 : 0,
    runHistory: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: lastRun,
  };
}

describe("finished work proof", () => {
  it("counts only successful executions", () => {
    const now = new Date("2026-08-22T00:00:00.000Z");
    const count = countSuccessfulFinishedWorkThisMonth({
      now,
      xAutoPostsPostedThisMonth: 2,
      automations: [
        sample("success", "2026-08-20T00:00:00.000Z"),
        sample("failed", "2026-08-21T00:00:00.000Z"),
      ],
      projects: [],
    });
    expect(count).toBe(3);
    expect(formatFinishedWorkThisMonthLine(count)).toBe(
      "今月MINERVOTが 3件の仕事を自動で完了",
    );
    expect(formatFinishedWorkThisMonthLine(0)).toBeNull();
  });
});
