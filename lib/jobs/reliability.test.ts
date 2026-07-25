import { beforeEach, describe, expect, it } from "vitest";

import { evaluateCompletionEvidence } from "./completion-evidence";
import {
  buildManualAutomationIdempotencyKey,
  buildScheduledAutomationIdempotencyKey,
} from "./idempotency";
import {
  claimAutomationJob,
  resetAutomationJobStoreForTests,
} from "./job-store";
import { markJobFailed, markJobRunning } from "./reliability";
import { classifyRetryError, computeNextRetryAt } from "./retry-classifier";
import { resolveJobStepLabel } from "./step-labels";

describe("job idempotency", () => {
  beforeEach(() => {
    resetAutomationJobStoreForTests();
  });

  it("dedupes scheduled runs with same slot key", async () => {
    const key = buildScheduledAutomationIdempotencyKey({
      userId: "u1",
      automationId: "a1",
      scheduledAt: "2026-07-22T09:00:00.000Z",
    });
    const first = await claimAutomationJob({
      id: "job-1",
      userId: "u1",
      automationId: "a1",
      idempotencyKey: key,
    });
    const second = await claimAutomationJob({
      id: "job-2",
      userId: "u1",
      automationId: "a1",
      idempotencyKey: key,
    });
    expect(first.action).toBe("created");
    expect(second.action).toBe("skip");
  });

  it("dedupes manual runs within the same minute", () => {
    const now = 1_700_000_000_000;
    const a = buildManualAutomationIdempotencyKey({
      userId: "u1",
      automationId: "a1",
      nowMs: now,
    });
    const b = buildManualAutomationIdempotencyKey({
      userId: "u1",
      automationId: "a1",
      nowMs: now + 30_000,
    });
    expect(a).toBe(b);
  });
});

describe("retry classifier", () => {
  it("schedules 1m/5m/15m backoff", () => {
    expect(computeNextRetryAt(1, 0)).toBe(new Date(60_000).toISOString());
    expect(computeNextRetryAt(2, 0)).toBe(new Date(300_000).toISOString());
    expect(computeNextRetryAt(3, 0)).toBe(new Date(900_000).toISOString());
  });

  it("does not retry OAuth errors", () => {
    expect(classifyRetryError(new Error("OAuth token expired"))).toBe(
      "non_retryable",
    );
  });
});

describe("completion evidence", () => {
  it("requires tweet proof for sns_post", () => {
    const ok = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      tweetId: "123",
      tweetUrl: "https://x.com/u/status/123",
    });
    expect(ok.status).toBe("completed");

    const partial = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
    });
    expect(partial.status).toBe("partially_completed");
  });

  it("marks waiting_for_approval when not approved", () => {
    const result = evaluateCompletionEvidence({
      orchestrationStatus: "completed",
      approved: false,
      deliverableCount: 1,
      snsPostFailure: null,
      storageUrl: "https://drive.example/folder",
    });
    expect(result.status).toBe("waiting_for_approval");
  });
});

describe("step labels", () => {
  it("maps orchestrate to user-friendly label", () => {
    expect(resolveJobStepLabel("orchestrate")).toBe("内容を作成");
    expect(resolveJobStepLabel("deliverables")).toBe("PDFを生成");
  });
});

describe("job reliability store", () => {
  beforeEach(() => {
    resetAutomationJobStoreForTests();
  });

  it("persists retry state with next_retry_at", async () => {
    await markJobRunning({
      jobId: "j1",
      userId: "u1",
      automationId: "a1",
      step: "orchestrate",
    });
    const failed = await markJobFailed({
      jobId: "j1",
      userId: "u1",
      error: new Error("ETIMEDOUT"),
      automationId: "a1",
    });
    expect(failed.willRetry).toBe(true);
    expect(failed.record.status).toBe("retrying");
    expect(failed.record.nextRetryAt).toBeTruthy();
  });
});
