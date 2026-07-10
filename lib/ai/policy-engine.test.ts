import { describe, expect, it } from "vitest";

import {
  resolveAiPolicy,
  resolvePlannerPolicy,
  resolveWorkerPolicy,
  resolveTaskPolicy,
} from "@/lib/ai/policy-engine";

describe("AI Policy Engine", () => {
  it("routes planner to cheap model with low reasoning", () => {
    const decision = resolvePlannerPolicy({ assignment: "ブログ記事", deliverableType: "blog" });
    expect(decision.taskType).toBe("planner_unified");
    expect(decision.model).toBe("gpt-5-mini");
    expect(decision.maxOutputTokens).toBe(2048);
    expect(decision.temperature).toBe(0.4);
    expect(decision.reasoningLevel).toBe("low");
    expect(decision.costPriority).toBe("minimum");
  });

  it("routes heavy worker deliverables to strong model", () => {
    const decision = resolveWorkerPolicy({ deliverableType: "blog" });
    expect(decision.taskType).toBe("worker_deliverable");
    expect(decision.model).toBe("gpt-5.5");
    expect(decision.maxOutputTokens).toBe(8192);
    expect(decision.reasoningLevel).toBe("medium");
    expect(decision.costPriority).toBe("quality");
  });

  it("routes light worker deliverables to cheap model", () => {
    const decision = resolveWorkerPolicy({ deliverableType: "email" });
    expect(decision.taskType).toBe("worker_deliverable_light");
    expect(decision.model).toBe("gpt-5-mini");
    expect(decision.maxOutputTokens).toBe(3072);
  });

  it("routes worker revision for heavy types to strong model", () => {
    const decision = resolveWorkerPolicy({ deliverableType: "proposal", revision: true });
    expect(decision.taskType).toBe("worker_revision");
    expect(decision.model).toBe("gpt-5.5");
  });

  it("downgrades worker policy in low cost saving mode", () => {
    const decision = resolveWorkerPolicy({
      deliverableType: "presentation",
      costSavingMode: "low",
    });
    expect(decision.taskType).toBe("worker_deliverable_light");
    expect(decision.costPriority).toBe("minimum");
  });

  it("upgrades worker policy in high cost saving mode", () => {
    const decision = resolveWorkerPolicy({
      deliverableType: "email",
      costSavingMode: "high",
    });
    expect(decision.taskType).toBe("worker_deliverable");
    expect(decision.costPriority).toBe("quality");
  });

  it("accepts future routing context without changing defaults", () => {
    const baseline = resolveAiPolicy({ department: "planning", taskType: "planner_unified" });
    const withPlan = resolveAiPolicy({
      department: "planning",
      taskType: "planner_unified",
      subscriptionPlan: "pro",
      estimatedComplexity: "high",
      estimatedCostUsd: 0.5,
    });
    expect(withPlan).toEqual(baseline);
  });

  it("resolves explicit task types for non-planner/worker paths", () => {
    expect(resolveTaskPolicy("research_synthesis").model).toBe("gpt-5-mini");
    expect(resolveTaskPolicy("reviewer_fallback").maxOutputTokens).toBe(768);
    expect(resolveTaskPolicy("chat").model).toBe("gpt-5.5");
  });
});
