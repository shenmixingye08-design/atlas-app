import { describe, expect, it } from "vitest";

import type { Project } from "@/lib/projects/types";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import { buildWorkOutcomeSummary } from "./work-outcome-summary";

function sampleProject(overrides?: Partial<Project>): Project {
  return {
    id: "commander-demo",
    title: "X投稿",
    workRequest: "Xに明日のイベント告知を投稿して",
    status: "completed",
    progress: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedEmployees: [],
    result: {
      assignment: "Xに明日のイベント告知を投稿して",
      status: "completed",
      workflow: hydrateWorkflowState({ status: "completed" }),
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [
        {
          task: { id: 1, title: "投稿文", description: "作成" },
          assignedEmployeeId: "development-senior-dev",
          worker: {
            result: {
              agentId: "worker",
              role: "worker",
              name: "制作AI",
              outputText: "{}",
              responseId: "r1",
              status: "completed",
              model: "gpt-test",
            },
            durationMs: 10,
          },
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "skipped",
          approved: true,
        },
      ],
      deliverable: {
        ...emptyDeliverable("social_post"),
        title: "イベント告知",
        content: "明日のイベント、ぜひご参加ください。",
        metadata: {
          ...emptyDeliverable("social_post").metadata,
          snsPost: "明日のイベント、ぜひご参加ください。",
        },
      },
      reviewComments: "",
      approved: true,
      finalResponse: "投稿文を用意しました",
      totalDurationMs: 95_000,
    },
    ...overrides,
  };
}

describe("buildWorkOutcomeSummary", () => {
  it("surfaces work done, deliverable, AI actions, duration, and next tips", () => {
    const summary = buildWorkOutcomeSummary(sampleProject());
    expect(summary.workDone).toContain("イベント告知");
    expect(summary.deliverableTitle).toBeTruthy();
    expect(summary.deliverablePreview).toContain("イベント");
    expect(summary.usedAi.length).toBeGreaterThan(0);
    expect(summary.aiActions.length).toBeGreaterThan(0);
    expect(summary.deliverables.length).toBeGreaterThan(0);
    expect(summary.durationLabel).toContain("分");
    expect(summary.nextRecommendations.length).toBeGreaterThan(0);
    expect(summary.deliverableLinks[0]?.href).toContain("/projects/");
  });
});
