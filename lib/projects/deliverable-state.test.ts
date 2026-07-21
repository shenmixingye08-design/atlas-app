import { describe, expect, it } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import {
  notFoundDisplayState,
  resolveDeliverableDisplayState,
} from "./deliverable-state";
import type { Project } from "./types";

function baseResult(overrides: Partial<OrchestrationResult> = {}): OrchestrationResult {
  return {
    assignment: "テスト依頼",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable("document"),
    reviewComments: "",
    approved: true,
    finalResponse: "",
    totalDurationMs: 0,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    ...overrides,
  };
}

function baseProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return {
    id: "commander-run_1",
    title: "テスト成果物",
    workRequest: "テスト依頼",
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
    ...overrides,
  };
}

describe("resolveDeliverableDisplayState", () => {
  it("returns ready when the deliverable has body content", () => {
    const deliverable = emptyDeliverable("document");
    deliverable.markdown = "# 完成した成果物\n\n本文です。";
    const project = baseProject({
      result: baseResult({ deliverable }),
    });

    expect(resolveDeliverableDisplayState(project).kind).toBe("ready");
  });

  it("returns ready when only finalResponse is present", () => {
    const project = baseProject({
      result: baseResult({ finalResponse: "完了しました。" }),
    });

    expect(resolveDeliverableDisplayState(project).kind).toBe("ready");
  });

  it("returns failed with a reason when the result failed", () => {
    const project = baseProject({
      status: "review",
      error: "外部APIに接続できませんでした",
      result: baseResult({ status: "failed", error: "外部APIに接続できませんでした" }),
    });

    const state = resolveDeliverableDisplayState(project);
    expect(state.kind).toBe("failed");
    if (state.kind === "failed") {
      expect(state.reason).toContain("外部API");
    }
  });

  it("returns generating when no result body exists yet", () => {
    const project = baseProject({ status: "running", result: null });
    expect(resolveDeliverableDisplayState(project).kind).toBe("generating");
  });

  it("returns generating (not blank) for a result object with no body", () => {
    const project = baseProject({
      result: baseResult({ finalResponse: "" }),
    });
    expect(resolveDeliverableDisplayState(project).kind).toBe("generating");
  });

  it("strips secrets from failure reasons", () => {
    const project = baseProject({
      error: "failed sk-abcdef123456 OPENAI_API_KEY missing",
      result: baseResult({ status: "failed", error: "failed sk-abcdef123456" }),
    });
    const state = resolveDeliverableDisplayState(project);
    if (state.kind === "failed") {
      expect(state.reason ?? "").not.toContain("sk-abcdef");
    }
  });

  it("exposes a non-empty not-found message", () => {
    expect(notFoundDisplayState().message.length).toBeGreaterThan(0);
  });
});
