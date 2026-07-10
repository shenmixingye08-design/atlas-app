import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildWorkflowCacheKey,
  clearWorkflowCache,
  hashAssignment,
  setWorkflowCache,
} from "@/lib/ai/workflow-cache";
import { ATLAS_POLICY_VERSION, ATLAS_WORKFLOW_VERSION } from "@/lib/ai/versions";
import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification";
import { deliverableHasContent } from "@/lib/orchestration/deliverable-types";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import { resolveMockLlmOutput } from "@/lib/ai/mock-responses";

const BLOG_ASSIGNMENT = "AI活用のブログ記事を書いて";
const SALES_EMAIL_ASSIGNMENT =
  "建設会社へ太陽光発電の営業メールを作成してください。500文字程度。";
const SNS_ASSIGNMENT = "太陽光発電ソリューションのSNS投稿文を作成してください。";

describe("workflow isolation", () => {
  afterEach(() => {
    clearWorkflowCache();
    vi.unstubAllEnvs();
  });

  it("uses versioned cache keys with assignment hash and deliverable type", () => {
    const blogKey = buildWorkflowCacheKey({
      assignment: BLOG_ASSIGNMENT,
      deliverableType: "blog",
    });
    const emailKey = buildWorkflowCacheKey({
      assignment: SALES_EMAIL_ASSIGNMENT,
      deliverableType: "email",
    });

    expect(blogKey).not.toBe(emailKey);
    expect(hashAssignment(BLOG_ASSIGNMENT)).not.toBe(hashAssignment(SALES_EMAIL_ASSIGNMENT));
  });

  it("does not replay blog cache for an email request", () => {
    const blogType = classifyDeliverableType(BLOG_ASSIGNMENT);
    const blogKey = buildWorkflowCacheKey({
      assignment: BLOG_ASSIGNMENT,
      deliverableType: blogType,
    });

    const blogWorkerJson = resolveMockLlmOutput("worker_deliverable", BLOG_ASSIGNMENT);
    const blogDeliverable = buildDeliverable({
      assignment: BLOG_ASSIGNMENT,
      executions: [
        {
          task: { id: 1, title: "Blog", description: "Write blog" },
          assignedEmployeeId: "development-senior-dev",
          worker: {
            result: {
              agentId: "worker",
              role: "worker",
              name: "Worker",
              outputText: blogWorkerJson,
              responseId: "mock-blog",
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
      expectedType: blogType,
    });

    setWorkflowCache(blogKey, {
      deliverable: blogDeliverable,
      workerOutput: blogWorkerJson,
      deliverableType: blogType,
    });

    const emailType = classifyDeliverableType(SALES_EMAIL_ASSIGNMENT);
    const emailKey = buildWorkflowCacheKey({
      assignment: SALES_EMAIL_ASSIGNMENT,
      deliverableType: emailType,
    });

    expect(emailKey).not.toBe(blogKey);

    const emailWorkerJson = resolveMockLlmOutput(
      "worker_deliverable",
      SALES_EMAIL_ASSIGNMENT,
    );
    const emailDeliverable = buildDeliverable({
      assignment: SALES_EMAIL_ASSIGNMENT,
      executions: [
        {
          task: { id: 1, title: "営業メール", description: "Sales email" },
          assignedEmployeeId: "development-senior-dev",
          worker: {
            result: {
              agentId: "worker",
              role: "worker",
              name: "Worker",
              outputText: emailWorkerJson,
              responseId: "mock-email",
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
      expectedType: emailType,
    });

    expect(emailDeliverable.type).toBe("email");
    expect(emailDeliverable.content).toMatch(/件名[:：]/);
    expect(emailDeliverable.content).not.toMatch(/ブログ運用ガイド/);
  });

  it("runs blog → sales email → SNS sequentially without cross-contamination", async () => {
    vi.mock("server-only", () => ({}));
    vi.stubEnv("ATLAS_MOCK_LLM", "true");

    const { orchestrate } = await import("@/lib/orchestration/orchestrator");

    const blogResult = await orchestrate({ assignment: BLOG_ASSIGNMENT });
    expect(blogResult.deliverable.type).toBe("blog");
    expect(blogResult.deliverable.content).toMatch(/ブログ|AI/i);

    const emailResult = await orchestrate({ assignment: SALES_EMAIL_ASSIGNMENT });
    expect(emailResult.status).toBe("completed");
    expect(emailResult.approved).toBe(true);
    expect(emailResult.deliverable.type).toBe("email");
    expect(emailResult.deliverable.content).toMatch(/件名[:：]/);
    expect(emailResult.deliverable.content).not.toMatch(/SEO|ブログ運用|トレンド/i);
    expect(emailResult.tasks.some((t) => /メール|営業/i.test(t.title))).toBe(true);
    expect(emailResult.research?.reportStatus).not.toBe("completed");
    expect(emailResult.isolationDebug?.deliverableType).toBe("email");
    expect(emailResult.isolationDebug?.pipeline.plannerExecuted).toBe(true);
    expect(emailResult.isolationDebug?.pipeline.workerExecuted).toBe(true);
    expect(emailResult.isolationDebug?.pipeline.workerOutputExists).toBe(true);
    expect(emailResult.isolationDebug?.pipeline.deliverableBuilderInputSource).toBe("worker");
    expect(emailResult.isolationDebug?.pipeline.needsReviewReason).toBeNull();
    expect(emailResult.isolationDebug?.workflowVersion).toBe(ATLAS_WORKFLOW_VERSION);
    expect(emailResult.isolationDebug?.policyVersion).toBe(ATLAS_POLICY_VERSION);

    const snsResult = await orchestrate({ assignment: SNS_ASSIGNMENT });
    expect(snsResult.status).toBe("completed");
    expect(deliverableHasContent(snsResult.deliverable)).toBe(true);
    expect(snsResult.deliverable.type).toBe("document");
    expect(snsResult.deliverable.content).toMatch(/SNS|投稿|#/i);
    expect(snsResult.deliverable.content).not.toMatch(/件名:|ブログ運用ガイド/i);
    expect(snsResult.tasks.some((t) => /SNS|投稿/i.test(t.title))).toBe(true);

    expect(emailResult.isolationDebug?.cacheKey).not.toBe(blogResult.isolationDebug?.cacheKey);
    expect(snsResult.isolationDebug?.cacheKey).not.toBe(emailResult.isolationDebug?.cacheKey);
  });
});
