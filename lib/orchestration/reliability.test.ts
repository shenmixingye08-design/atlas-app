import { describe, expect, it } from "vitest";

import { createWorkflowCostMeter } from "@/lib/ai/cost-meter";
import { WORKFLOW_LIMITS } from "@/lib/ai/workflow-limits";
import { resolveMockLlmOutput } from "@/lib/ai/mock-responses";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import { deliverableHasContent } from "@/lib/orchestration/deliverable-types";
import { validateDeliverableFields } from "@/lib/orchestration/deliverable-validation";
import { sanitizeOrchestrationResultForClient } from "@/lib/orchestration/sanitize-response";
import { migrateOrchestrationResult } from "@/lib/projects/migrate-result";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { assertWorkersProducedDeliverables } from "@/lib/orchestration/worker-validation";
import { tryParseStoredDeliverable } from "@/lib/orchestration/worker-output";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";

const BLOG_WORKER_JSON = resolveMockLlmOutput("worker_deliverable", "ブログ記事");

describe("reliability: mock blog worker", () => {
  it("returns structured JSON with required fields", () => {
    const parsed = JSON.parse(BLOG_WORKER_JSON);
    expect(parsed.type).toBe("blog");
    expect(parsed.title).toBeTruthy();
    expect(parsed.content).toBeTruthy();
    expect(parsed.markdown || parsed.content).toBeTruthy();
  });

  it("builds a non-empty deliverable", () => {
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
              outputText: BLOG_WORKER_JSON,
              responseId: "mock",
              status: "completed",
              model: "atlas-mock",
            },
            durationMs: 1,
          },
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "skipped",
          approved: true,
        },
      ],
    });

    expect(deliverableHasContent(deliverable)).toBe(true);
    expect(validateDeliverableFields(deliverable).valid).toBe(true);
  });
});

describe("reliability: worker validation", () => {
  it("rejects plain prose worker output", () => {
    expect(() =>
      assertWorkersProducedDeliverables(
        [
          {
            task: { id: 1, title: "T", description: "D" },
            assignedEmployeeId: "development-senior-dev",
            worker: {
              result: {
                agentId: "worker",
                role: "worker",
                name: "Worker",
                outputText: "just plain text without json",
                responseId: "x",
                status: "completed",
                model: "test",
              },
              durationMs: 1,
            },
            workerStatus: "completed",
            reviewer: null,
            reviewerStatus: "skipped",
            approved: false,
          },
        ],
        "test assignment",
      ),
    ).toThrow();
  });

  it("accepts cached deliverable JSON", () => {
    const stored = buildDeliverable({
      assignment: "proposal",
      executions: [
        {
          task: { id: 1, title: "P", description: "Proposal" },
          assignedEmployeeId: "development-senior-dev",
          worker: {
            result: {
              agentId: "worker",
              role: "worker",
              name: "Worker",
              outputText: resolveMockLlmOutput("worker_deliverable", "提案書"),
              responseId: "mock",
              status: "completed",
              model: "atlas-mock",
            },
            durationMs: 1,
          },
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "skipped",
          approved: true,
        },
      ],
    });

    expect(tryParseStoredDeliverable(JSON.stringify(stored))).not.toBeNull();
  });
});

describe("reliability: cost guard", () => {
  it("blocks at max LLM calls (no off-by-one)", () => {
    const meter = createWorkflowCostMeter();
    for (let i = 0; i < WORKFLOW_LIMITS.maxLlmCalls; i += 1) {
      meter.recordLlmCall({
        department: "production",
        taskType: "worker_deliverable",
        inputText: "in",
        outputText: "out",
      });
    }

    expect(() => meter.assertWithinLimits()).toThrow();
  });
});

describe("reliability: persistence migration", () => {
  it("migrates legacy string deliverable", () => {
    const legacy = {
      assignment: "旧プロジェクト",
      status: "completed",
      deliverable: "# Legacy body\n\nContent here for migration test.",
      finalResponse: "summary only",
      approved: true,
      reviewComments: "",
      totalDurationMs: 1,
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
    } as unknown as OrchestrationResult;

    const migrated = migrateOrchestrationResult(legacy);
    expect(deliverableHasContent(migrated.deliverable)).toBe(true);
    expect(typeof migrated.deliverable).toBe("object");
  });

  it("hydrates empty deliverable from finalResponse when meaningful", () => {
    const longBody = "x".repeat(200);
    const legacy = {
      assignment: "legacy",
      status: "completed",
      deliverable: emptyDeliverable(),
      finalResponse: longBody,
      approved: false,
      reviewComments: "",
      totalDurationMs: 1,
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
    } as OrchestrationResult;

    const migrated = migrateOrchestrationResult(legacy);
    expect(migrated.deliverable.content).toContain("x");
  });
});

describe("reliability: client response sanitization", () => {
  it("strips debug fields by default", () => {
    const result = {
      assignment: "a",
      status: "completed",
      deliverable: emptyDeliverable(),
      approved: false,
      finalResponse: "",
      reviewComments: "",
      totalDurationMs: 1,
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      costDebug: { llmCallCount: 2 },
      pipelineDebug: { stages: [], failureStage: null, deliverableReady: false, approved: false },
    } as OrchestrationResult;

    const sanitized = sanitizeOrchestrationResultForClient(result);
    expect("costDebug" in sanitized).toBe(false);
    expect("pipelineDebug" in sanitized).toBe(false);
  });
});

describe("reliability: email and research mocks", () => {
  it("returns email structured JSON", () => {
    const json = resolveMockLlmOutput("worker_deliverable", "メールを書いて");
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("email");
    expect(parsed.content).toBeTruthy();
  });

  it("returns research synthesis JSON", () => {
    const json = resolveMockLlmOutput("research_synthesis", "market research");
    const parsed = JSON.parse(json);
    expect(parsed.executiveSummary).toBeTruthy();
  });
});
