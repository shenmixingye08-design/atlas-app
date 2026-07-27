import { describe, expect, it } from "vitest";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

import { computeTodayOutcomes } from "./today-outcomes";

function project(partial: Partial<Project> & Pick<Project, "id" | "status">): Project {
  return {
    title: partial.title ?? "仕事",
    workRequest: partial.workRequest ?? "依頼",
    progress: partial.progress ?? 0,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    assignedEmployees: partial.assignedEmployees ?? [],
    result: partial.result ?? null,
    ...partial,
  };
}

describe("computeTodayOutcomes", () => {
  it("includes AI running count with today's completed metrics", () => {
    const now = new Date("2026-07-21T10:00:00.000Z");
    const stats = computeTodayOutcomes(
      [
        project({
          id: "p1",
          status: "completed",
          workRequest: "X投稿を作って",
          updatedAt: now.toISOString(),
        }),
        project({
          id: "p2",
          status: "running",
          workRequest: "調査して",
          updatedAt: now.toISOString(),
        }),
      ],
      [
        {
          id: "a1",
          userId: "u1",
          name: "メール自動化",
          description: "",
          schedule: { kind: "email", label: "手動" },
          workflow: { assignment: "フォローアップメールを送る" },
          timing: { startDate: null, endCondition: { type: "never" } },
          executionLevel: "approve_then_run",
          executionMode: "standard",
          snsBatchDays: null,
          executionFlow: { templateId: "generic", steps: [] },
          destination: "none",
          status: "running",
          enabled: true,
          lastRun: null,
          nextRun: null,
          lastWorkflowRunId: null,
          lastError: null,
          successCount: 0,
          failureCount: 0,
          runHistory: [],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        } satisfies Automation,
      ],
      now,
    );

    expect(stats.completedTasks).toBe(1);
    expect(stats.aiRunning).toBe(2);
    expect(stats.snsPosts).toBe(1);
  });
});
