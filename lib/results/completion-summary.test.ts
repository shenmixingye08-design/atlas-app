import { describe, expect, it } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { Project } from "@/lib/projects/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import { buildCompletionSummary } from "./completion-summary";

function baseProject(partial: Partial<Project> = {}): Project {
  return {
    id: "commander-demo",
    title: "営業メール",
    workRequest: "新規顧客向けの営業メールを作成してください",
    status: "completed",
    progress: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedEmployees: [],
    result: {
      assignment: "新規顧客向けの営業メールを作成してください",
      status: "completed",
      workflow: hydrateWorkflowState({ status: "completed" }),
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      deliverable: {
        ...emptyDeliverable("email"),
        title: "ご提案のご案内",
        content: "本文",
      },
      reviewComments: "",
      approved: true,
      finalResponse: "本文",
      totalDurationMs: 95_000,
    },
    ...partial,
  };
}

describe("buildCompletionSummary", () => {
  it("surfaces work, deliverable, duration, and next recommend", () => {
    const summary = buildCompletionSummary(baseProject());
    expect(summary.workDone).toContain("営業メール");
    expect(summary.deliverableTitle).toBe("ご提案のご案内");
    expect(summary.deliverableHref).toContain("/projects/commander-demo");
    expect(summary.durationLabel).toContain("分");
    expect(summary.nextRecommend).toBeTruthy();
    expect(summary.failureReason).toBeNull();
  });

  it("shows failure reason when present", () => {
    const summary = buildCompletionSummary(
      baseProject({
        status: "running",
        error: "投稿に失敗しました",
        result: {
          ...baseProject().result!,
          status: "failed",
          error: "投稿に失敗しました",
        },
      }),
    );
    expect(summary.failureReason).toContain("投稿に失敗");
  });
});
