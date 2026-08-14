import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orchestration/run-for-user", () => ({
  runOrchestrationForUser: vi.fn(async (input: { assignment: string }) => ({
    result: {
      assignment: input.assignment,
      status: "completed",
      workflow: {
        workflowId: "wf_test",
        state: "completed",
        transitions: [],
        updatedAt: new Date().toISOString(),
      },
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      deliverable: {
        type: "document",
        title: "結果",
        markdown: "要約結果です。",
        plainText: "要約結果です。",
        html: "<p>要約結果です。</p>",
        metadata: {
          tags: [],
          seo: { title: "", description: "", keywords: [] },
          snsPost: "",
          topic: "",
          audience: "",
          sourceTaskId: null,
          workerCount: 1,
        },
        exportFormats: ["txt"],
      },
      reviewComments: "",
      approved: true,
      finalResponse: "要約結果です。分かりやすく整理しました。",
      totalDurationMs: 12,
    },
    usedWorkMemoryCount: 0,
    memoryTypesUsed: [],
  })),
}));

vi.mock("@/lib/learning-engine/service", () => ({
  runLearningAnalysis: vi.fn(),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyWorkCompleted: vi.fn(),
  notifyWorkFailed: vi.fn(),
  notifyAutomationAwaitingReview: vi.fn(),
}));

vi.mock("@/lib/automations/repositories/workflow-run-store", () => ({
  serverWorkflowRunRepository: {
    start: vi.fn(async () => ({ id: "wr_test" })),
    complete: vi.fn(async () => ({ id: "wr_test" })),
  },
}));

vi.mock("@/lib/commander/durable-store", () => ({
  persistCommanderRunToClerk: vi.fn(),
  persistCommanderResultAsProject: vi.fn(async () => "proj_test"),
  loadCommanderRunsFromClerk: vi.fn(async () => []),
}));

vi.mock("@/lib/automations/create-from-natural-language.server", () => ({
  createAutomationFromNaturalLanguage: vi.fn(async () => ({
    ok: true,
    frequency: "weekly",
    message:
      "自動化しました\n毎週月曜日 09:00に先週の仕事をまとめます。\n次回：8月18日（火） 09:00\n実行方法：実行前に確認",
    automation: {
      id: "auto_nl_e2e",
      name: "定期報告",
      enabled: true,
      nextRun: "2026-08-18T00:00:00.000Z",
      schedule: {
        kind: "schedule",
        preset: { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎週月曜 09:00",
      },
      executionLevel: "approve_then_run",
      status: "idle",
    },
  })),
}));

import { executeCommander, planCommander } from "./execute";
import { resetCommanderRunStoreForTests } from "./run-store";
import { evaluateCommanderConfirmation } from "./confirmation";
import { buildCommanderPlan } from "./plan";

describe("commander e2e request flows", () => {
  beforeEach(() => {
    resetCommanderRunStoreForTests();
  });

  it("test1: summarize request plans and executes without confirmation", async () => {
    const assignment = "この文章を分かりやすく要約してください";
    const plan = planCommander({ assignment, userId: "user_e2e" });
    expect(plan.status).toBe("planning");
    expect(plan.plan.executionOrder.length).toBeGreaterThan(0);

    const decision = evaluateCommanderConfirmation(assignment, plan.plan);
    expect(decision.required).toBe(false);

    const executed = await executeCommander({
      assignment,
      userId: "user_e2e",
      confirmed: true,
    });
    expect(executed.status).toBe("completed");
    expect(executed.result?.finalResponse).toContain("要約");
  });

  it("test2: polite sales email draft does not require send confirmation", () => {
    const assignment = "営業メールの返信文を丁寧に作成してください";
    const plan = buildCommanderPlan({ assignment, userId: "user_e2e" });
    const decision = evaluateCommanderConfirmation(assignment, plan);
    expect(decision.required).toBe(false);
    expect(plan.classification.deliverableType).toBe("email");
  });

  it("test3: weekly habit remember awaits confirmation then creates durable automation", async () => {
    const assignment =
      "毎週月曜日に先週の仕事をまとめる作業として覚えてください";
    const first = await executeCommander({
      assignment,
      userId: "user_e2e",
    });
    expect(first.status).toBe("awaiting_confirmation");
    expect(first.runId).toBeTruthy();
    expect(
      first.confirmationReasons.some((reason) => reason.includes("習慣") || reason.includes("定期")),
    ).toBe(true);

    const confirmed = await executeCommander({
      assignment,
      userId: "user_e2e",
      runId: first.runId!,
      confirmed: true,
    });
    expect(confirmed.status).toBe("completed");
    expect(confirmed.result?.finalResponse).toContain("自動化しました");
    expect(confirmed.result?.finalResponse).toContain("次回：");
    expect(confirmed.result?.finalResponse).not.toContain("Minute Scheduler");
    expect(confirmed.result?.finalResponse).not.toContain("approve_then_run");
    expect(confirmed.result?.finalResponse).not.toContain(
      "2026-08-18T00:00:00.000Z",
    );
    expect(confirmed.result?.finalResponse).not.toContain(
      "定期実行はまだ開始していません",
    );
  });
});
