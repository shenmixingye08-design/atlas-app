import { describe, expect, it } from "vitest";

import type { Automation } from "@/lib/automations/types";
import { createDefaultExecutionFlow } from "@/lib/automations/execution-flow";
import { DEFAULT_AUTOMATION_TIMING } from "@/lib/automations/timing-defaults";
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

function automation(
  partial: Partial<Automation> & Pick<Automation, "id" | "status">,
): Automation {
  const now = new Date().toISOString();
  return {
    userId: "u1",
    name: "自動化",
    description: "",
    schedule: { kind: "email", label: "手動" },
    workflow: { assignment: "フォローアップメールを送る" },
    timing: DEFAULT_AUTOMATION_TIMING,
    executionLevel: "approve_then_run",
    executionMode: "eco",
    snsBatchDays: null,
    executionFlow: createDefaultExecutionFlow(),
    destination: "none",
    enabled: true,
    lastRun: null,
    nextRun: null,
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
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
        automation({
          id: "a1",
          userId: "u1",
          name: "メール自動化",
          description: "",
          schedule: { kind: "email", label: "手動" },
          workflow: { assignment: "フォローアップメールを送る" },
          status: "running",
          enabled: true,
          lastRun: null,
          nextRun: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      ],
      now,
    );

    expect(stats.completedTasks).toBe(1);
    expect(stats.aiRunning).toBe(2);
    expect(stats.snsPosts).toBe(1);
  });
});
