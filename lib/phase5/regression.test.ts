import { describe, expect, it } from "vitest";

import { countsTowardSuccessMetrics, shouldSkipExternalPublish } from "@/lib/automations/test-run";
import { classifyRetryError, computeNextRetryAt, MAX_JOB_RETRIES } from "@/lib/jobs/retry-classifier";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";
import { buildManualAutomationIdempotencyKey } from "@/lib/jobs/idempotency";
import { isDeliverableCompleted } from "@/lib/deliverables/completed-filter";
import { sanitizeExcelCell } from "@/lib/documents/render/xlsx/sanitize-cell";
import {
  enforceAutomationTestRunRateLimit,
  enforceDocumentRenderRateLimit,
} from "@/lib/http/enforce-action-rate-limit";
import { resetRateLimitBucket } from "@/lib/http/rate-limit";

describe("Phase 5 regression guards", () => {
  it("classifies retryable vs fatal errors", () => {
    expect(classifyRetryError(new Error("ECONNRESET"))).toBe("retryable");
    expect(classifyRetryError(new Error("invalid api key"))).toBe("non_retryable");
  });

  it("uses bounded retry backoff", () => {
    const first = computeNextRetryAt(1);
    const last = computeNextRetryAt(MAX_JOB_RETRIES);
    expect(new Date(first).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(last).getTime()).toBeGreaterThan(new Date(first).getTime());
  });

  it("requires tweet proof for sns_post completion", () => {
    const incomplete = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
    });
    expect(incomplete.status).toBe("partially_completed");
  });

  it("builds stable manual idempotency keys", () => {
    const key = buildManualAutomationIdempotencyKey({
      userId: "user",
      automationId: "auto",
      nowMs: new Date("2026-07-22T00:00:00.000Z").getTime(),
    });
    expect(key).toContain("user");
    expect(key).toContain("auto");
  });

  it("never marks zero-byte deliverables completed", () => {
    expect(
      isDeliverableCompleted({
        deliverable: {
          id: "d1",
          fileName: "x.pdf",
          format: "pdf",
          mimeType: "application/pdf",
          generatedAt: new Date().toISOString(),
          sizeBytes: 0,
          isPlaceholder: false,
          downloadUrl: "/api/deliverables/d1",
          validationPassed: true,
        },
      }),
    ).toBe(false);
  });

  it("sanitizes formula injection in excel cells", () => {
    expect(sanitizeExcelCell("=1+1")).toMatch(/^'/);
    expect(sanitizeExcelCell("hello")).toBe("hello");
  });

  it("skips external publish on test runs by default", () => {
    expect(shouldSkipExternalPublish({ mode: "test", livePublish: false })).toBe(true);
    expect(countsTowardSuccessMetrics("test")).toBe(false);
    expect(countsTowardSuccessMetrics("scheduled")).toBe(true);
  });

  it("rate limits render and test-run spam", () => {
    resetRateLimitBucket("document-render");
    resetRateLimitBucket("automation-test-run");
    const userId = "phase5_rate_user";
    expect(enforceDocumentRenderRateLimit(userId)).toBeNull();
    expect(enforceAutomationTestRunRateLimit(userId)).toBeNull();
  });
});
