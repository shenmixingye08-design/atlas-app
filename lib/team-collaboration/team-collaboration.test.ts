import { describe, expect, it } from "vitest";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import { buildTeamCollaborationSnapshot } from "./build-snapshot";
import { topologicalSortTasks, enrichTaskDependencies } from "./dependencies";
import { pickAlternateEmployee } from "./employee-map";

describe("team collaboration", () => {
  it("infers sequential task dependencies", () => {
    const tasks = enrichTaskDependencies([
      { id: 1, title: "日程確認", description: "" },
      { id: 2, title: "資料作成", description: "" },
      { id: 3, title: "SNS告知", description: "" },
    ]);

    expect(tasks[1]?.dependsOn).toEqual([1]);
    expect(topologicalSortTasks(tasks).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("builds collaboration snapshot with planner and handoffs", () => {
    const result = {
      assignment: "来月の展示会の準備",
      status: "completed",
      ceo: null,
      plannerPlan: {
        result: { agentId: "planner", role: "planner", name: "Planner", outputText: "", responseId: "p1", status: "completed", model: "test" },
        durationMs: 1000,
      },
      plannerTasks: null,
      tasks: [
        { id: 1, title: "日程確認", description: "Google Calendar" },
        { id: 2, title: "PowerPoint作成", description: "営業資料" },
      ],
      executions: [
        {
          task: { id: 1, title: "日程確認", description: "" },
          assignedEmployeeId: "planning-lead-planner",
          worker: null,
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "completed",
          approved: true,
        },
        {
          task: { id: 2, title: "PowerPoint作成", description: "" },
          assignedEmployeeId: "development-senior-dev",
          worker: null,
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "completed",
          approved: true,
        },
      ],
      deliverable: { type: "sales_material", title: "展示会資料", summary: "", content: "", markdown: "", metadata: {} },
      reviewComments: "",
      approved: true,
      finalResponse: "展示会準備が完了しました",
      totalDurationMs: 5000,
    } as unknown as OrchestrationResult;

    const snapshot = buildTeamCollaborationSnapshot(result);
    expect(snapshot.stages.some((s) => s.id === "planner")).toBe(true);
    expect(snapshot.handoffs.length).toBeGreaterThan(0);
    expect(snapshot.finalReviewPassed).toBe(true);
  });

  it("picks alternate employee on reassignment", () => {
    const alternate = pickAlternateEmployee("development", ["development-senior-dev"]);
    expect(alternate).not.toBe("development-senior-dev");
  });
});
