import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMockLlmOutput } from "@/lib/ai/mock-responses";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import { deliverableHasContent } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { WorkflowState } from "@/lib/orchestration/workflow-state";
import { buildWorkflowInspectorReport } from "@/lib/orchestration/workflow-inspector";
import {
  isAtlasClientDebugEnabled,
  orchestrationHasInspectorPayload,
  shouldShowWorkflowInspector,
} from "@/lib/debug/atlas-debug";
import { sanitizeOrchestrationResultForClient } from "@/lib/orchestration/sanitize-response";

const BLOG_JSON = resolveMockLlmOutput("worker_deliverable", "ブログ記事");

function buildMockBlogResult(): OrchestrationResult {
  const deliverable = buildDeliverable({
    assignment: "ブログ記事を書いて",
    executions: [
      {
        task: { id: 1, title: "Blog", description: "Write blog" },
        assignedEmployeeId: "development-senior-dev",
        worker: {
          result: {
            agentId: "worker",
            role: "worker",
            name: "Worker",
            outputText: BLOG_JSON,
            responseId: "mock-worker",
            status: "completed",
            model: "atlas-mock",
          },
          durationMs: 1200,
        },
        workerStatus: "completed",
        reviewer: {
          result: {
            agentId: "reviewer",
            role: "reviewer",
            name: "Reviewer",
            outputText: "OK",
            responseId: "mock-reviewer",
            status: "completed",
            model: "atlas-rules",
          },
          durationMs: 50,
        },
        reviewerStatus: "completed",
        approved: true,
      },
    ],
  });

  return {
    assignment: "ブログ記事を書いて",
    status: "completed",
    workflow: {
      workflowId: "wf-inspector-test",
      state: WorkflowState.Completed,
      transitions: [
        {
          from: WorkflowState.Pending,
          to: WorkflowState.Planning,
          at: "2026-07-08T00:00:00.000Z",
        },
        {
          from: WorkflowState.DeliverableReady,
          to: WorkflowState.Completed,
          at: "2026-07-08T00:00:05.000Z",
        },
      ],
      updatedAt: "2026-07-08T00:00:05.000Z",
    },
    ceo: {
      result: {
        agentId: "ceo",
        role: "ceo",
        name: "CEO",
        outputText: "Strategic plan",
        responseId: "mock-ceo",
        status: "completed",
        model: "atlas-rules",
      },
      durationMs: 10,
    },
    plannerPlan: {
      result: {
        agentId: "planner",
        role: "planner",
        name: "Planner",
        outputText: "Plan",
        responseId: "mock-plan",
        status: "completed",
        model: "atlas-mock",
      },
      durationMs: 800,
    },
    plannerTasks: {
      result: {
        agentId: "planner",
        role: "planner",
        name: "Planner",
        outputText: "Tasks",
        responseId: "mock-tasks",
        status: "completed",
        model: "atlas-mock",
      },
      durationMs: 100,
    },
    tasks: [{ id: 1, title: "Blog", description: "Write blog" }],
    executions: [
      {
        task: { id: 1, title: "Blog", description: "Write blog" },
        assignedEmployeeId: "development-senior-dev",
        worker: {
          result: {
            agentId: "worker",
            role: "worker",
            name: "Worker",
            outputText: BLOG_JSON,
            responseId: "mock-worker",
            status: "completed",
            model: "atlas-mock",
          },
          durationMs: 1200,
        },
        workerStatus: "completed",
        reviewer: {
          result: {
            agentId: "reviewer",
            role: "reviewer",
            name: "Reviewer",
            outputText: "OK",
            responseId: "mock-reviewer",
            status: "completed",
            model: "atlas-rules",
          },
          durationMs: 50,
        },
        reviewerStatus: "completed",
        approved: true,
      },
    ],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse: "Blog ready",
    totalDurationMs: 5000,
    qualityLoop: {
      reviews: [],
      revisionCount: 0,
      currentScore: 90,
      passed: true,
      ceoApproval: {
        approved: true,
        ceo: null,
        status: "completed",
        comments: "Approved",
      },
    },
    costDebug: {
      llmCallCount: 2,
      cacheHits: 0,
      cacheMisses: 2,
      estimatedInputTokens: 1200,
      estimatedOutputTokens: 800,
      estimatedCostUsd: 0.012,
      departmentBreakdown: {
        planning: {
          calls: 1,
          estimatedCostUsd: 0.004,
          estimatedInputTokens: 400,
          estimatedOutputTokens: 200,
        },
        production: {
          calls: 1,
          estimatedCostUsd: 0.008,
          estimatedInputTokens: 800,
          estimatedOutputTokens: 600,
        },
      },
      calls: [
        {
          department: "planning",
          taskType: "planner_unified",
          model: "gpt-5.5",
          estimatedInputTokens: 400,
          estimatedOutputTokens: 200,
          estimatedCostUsd: 0.004,
          cached: false,
          timestamp: "2026-07-08T00:00:01.000Z",
          policyTaskType: "planner_unified",
          policyModel: "gpt-5.5",
          policyReasoningLevel: "medium",
          policyCostPriority: "balanced",
        },
        {
          department: "production",
          taskType: "worker_deliverable",
          model: "gpt-5.5",
          estimatedInputTokens: 800,
          estimatedOutputTokens: 600,
          estimatedCostUsd: 0.008,
          cached: false,
          timestamp: "2026-07-08T00:00:02.000Z",
          policyTaskType: "worker_deliverable",
          policyModel: "gpt-5.5",
          policyReasoningLevel: "medium",
          policyCostPriority: "balanced",
        },
      ],
      limitsReached: false,
    },
    pipelineDebug: {
      stages: [
        { id: "ceo", label: "CEO", status: "ok" },
        { id: "planner", label: "Planner", status: "ok" },
        { id: "worker", label: "Worker", status: "ok" },
        { id: "deliverable_builder", label: "Deliverable Builder", status: "ok" },
      ],
      failureStage: null,
      deliverableReady: true,
      approved: true,
    },
  };
}

describe("workflow inspector report", () => {
  it("builds summary, stages, cost, and deliverable integrity for mock blog", () => {
    const result = buildMockBlogResult();
    const report = buildWorkflowInspectorReport(result);

    expect(report.summary.workflowId).toBe("wf-inspector-test");
    expect(report.summary.deliverableType).toBe("blog");
    expect(report.stages.length).toBeGreaterThanOrEqual(13);
    expect(report.aiCalls).toHaveLength(2);
    expect(report.cost?.totalLlmCalls).toBe(2);
    expect(report.cost?.totalEstimatedCostUsd).toBeCloseTo(0.012);
    expect(report.deliverableIntegrity.deliverableExists).toBe(true);
    expect(report.deliverableIntegrity.validationValid).toBe(true);
    expect(deliverableHasContent(result.deliverable)).toBe(true);
  });

  it("includes failure diagnostics when workflow failed", () => {
    const result = buildMockBlogResult();
    result.status = "failed";
    result.error = "Worker failed";
    result.stepError = {
      step: "worker",
      agentId: "worker",
      message: "Invalid JSON",
      timedOut: false,
    };
    result.workflow.state = WorkflowState.Failed;

    const report = buildWorkflowInspectorReport(result);
    expect(report.failure?.failedStage).toBe("worker");
    expect(report.failure?.reason).toContain("Worker failed");
    expect(report.failure?.rawError).toBeNull();
  });
});

describe("workflow inspector debug gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hides inspector when debug flags are false and payloads stripped", () => {
    vi.stubEnv("NEXT_PUBLIC_ATLAS_DEBUG", "");
    vi.stubEnv("ATLAS_DEBUG", "");

    const result = buildMockBlogResult();
    const sanitized = sanitizeOrchestrationResultForClient(result);

    expect(orchestrationHasInspectorPayload(sanitized)).toBe(false);
    expect(shouldShowWorkflowInspector(sanitized)).toBe(false);
  });

  it("shows inspector when NEXT_PUBLIC_ATLAS_DEBUG is true", () => {
    vi.stubEnv("NEXT_PUBLIC_ATLAS_DEBUG", "true");
    expect(isAtlasClientDebugEnabled()).toBe(true);
    expect(shouldShowWorkflowInspector(buildMockBlogResult())).toBe(true);
  });

  it("preserves debug payloads when ATLAS_DEBUG is true", () => {
    vi.stubEnv("ATLAS_DEBUG", "true");
    const sanitized = sanitizeOrchestrationResultForClient(buildMockBlogResult());
    expect(orchestrationHasInspectorPayload(sanitized)).toBe(true);
  });
});

describe("workflow inspector: mock blog orchestration", () => {
  it("runs mock blog pipeline with zero real OpenAI calls", async () => {
    vi.mock("server-only", () => ({}));
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    vi.stubEnv("ATLAS_DEBUG", "true");

    const { orchestrate } = await import("@/lib/orchestration/orchestrator");
    const result = await orchestrate({ assignment: "ブログ記事を書いて" });

    expect(result.status).toBe("completed");
    expect(deliverableHasContent(result.deliverable)).toBe(true);
    expect(result.costDebug).toBeDefined();
    expect(result.pipelineDebug).toBeDefined();

    const report = buildWorkflowInspectorReport(result);
    expect(report.stages.some((stage) => stage.id === "worker" && stage.output.exists)).toBe(
      true,
    );
    expect(report.cost?.totalLlmCalls).toBeGreaterThan(0);
    expect(report.deliverableIntegrity.deliverableExists).toBe(true);

    vi.unstubAllEnvs();
  });
});
