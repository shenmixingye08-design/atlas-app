import { describe, expect, it } from "vitest";

import { resolveMockLlmOutput } from "@/lib/ai/mock-responses";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import { validateDeliverableFields } from "@/lib/orchestration/deliverable-validation";
import { runDeterministicQa } from "@/lib/orchestration/deterministic-qa";
import { detectEmailSubject } from "@/lib/orchestration/email-deliverable";
import { parseWorkerDeliverablePayload } from "@/lib/orchestration/worker-output";

const SALES_EMAIL_ASSIGNMENT =
  "建設会社へ太陽光発電の営業メールを作成してください。500文字程度。";

describe("email deliverable generation", () => {
  it("parses mock sales email worker JSON with subject metadata", () => {
    const raw = resolveMockLlmOutput("worker_deliverable", SALES_EMAIL_ASSIGNMENT);
    const payload = parseWorkerDeliverablePayload(
      raw,
      SALES_EMAIL_ASSIGNMENT,
      "営業メール",
      "email",
    );

    expect(payload?.type).toBe("email");
    expect(payload?.subject).toBeTruthy();
    expect(payload?.markdown).toMatch(/## 件名/);
  });

  it("builds a valid approved email deliverable from worker output", () => {
    const raw = resolveMockLlmOutput("worker_deliverable", SALES_EMAIL_ASSIGNMENT);
    const deliverable = buildDeliverable({
      assignment: SALES_EMAIL_ASSIGNMENT,
      expectedType: "email",
      executions: [
        {
          task: { id: 1, title: "営業メール", description: "Sales email" },
          assignedEmployeeId: "development-senior-dev",
          worker: {
            result: {
              agentId: "worker",
              role: "worker",
              name: "Worker",
              outputText: raw,
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
    });

    expect(deliverable.type).toBe("email");
    expect(detectEmailSubject(deliverable)).toMatch(/太陽光|ご提案/);
    expect(deliverable.markdown).toMatch(/## 件名/);
    expect(deliverable.content).toMatch(/件名/);

    const validation = validateDeliverableFields(deliverable);
    expect(validation.valid).toBe(true);
    expect(validation.missingFields).not.toContain("metadata.seo");

    const qa = runDeterministicQa(deliverable);
    expect(qa.passed).toBe(true);
    expect(qa.failedChecks.join("; ")).not.toMatch(/SEO|heading|tags/i);
  });

  it("converts plain text email into structured deliverable", () => {
    const plain = `件名：太陽光発電のご提案

建設会社ご担当者様
お世話になっております。太陽光発電の導入についてご提案いたします。`;

    const payload = parseWorkerDeliverablePayload(
      plain,
      SALES_EMAIL_ASSIGNMENT,
      "営業メール",
      "email",
    );

    expect(payload?.type).toBe("email");
    expect(payload?.subject).toMatch(/太陽光/);
    expect(payload?.content).toMatch(/建設会社/);
  });
});
