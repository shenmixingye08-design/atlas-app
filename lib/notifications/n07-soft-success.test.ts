/**
 * N-07: Soft-success elimination unit + probe tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ackDelivered,
  ackFailed,
  ackSkipped,
} from "@/lib/notifications/channel-ack";
import {
  buildCanonicalExecutionResult,
  executionStatusFromJobStatus,
  notificationTypeForStatus,
} from "@/lib/notifications/execution-result";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";
import { resetNotificationStore } from "@/lib/notifications/store";
import { resetDurableInboxForTests } from "@/lib/notifications/durable-inbox";
import { resetSideEffectStoreForTests } from "@/lib/side-effects";

describe("N-07 canonical execution result", () => {
  it("SUCCESS requires sideEffectConfirmed", () => {
    const demoted = buildCanonicalExecutionResult({
      executionStatus: "SUCCESS",
      evidence: { sideEffectConfirmed: false },
      summary: "no proof",
    });
    expect(demoted.executionStatus).toBe("FAILED");
    expect(demoted.userCompleteClaimAllowed).toBe(false);
    expect(demoted.softSuccess).toBe(false);
    expect(demoted.notificationType).toBe("error");
  });

  it("true SUCCESS allows completed notification", () => {
    const ok = buildCanonicalExecutionResult({
      executionStatus: "SUCCESS",
      evidence: {
        sideEffectConfirmed: true,
        externalActionIds: ["tw_1"],
        externalUrls: ["https://x.com/i/status/1"],
      },
      summary: "posted",
    });
    expect(ok.executionStatus).toBe("SUCCESS");
    expect(ok.userCompleteClaimAllowed).toBe(true);
    expect(ok.notificationType).toBe("completed");
    expect(ok.jobStatus).toBe("completed");
  });

  it("PARTIAL never maps to completed notification", () => {
    expect(notificationTypeForStatus("PARTIAL")).toBe("awaiting_review");
    const partial = buildCanonicalExecutionResult({
      executionStatus: "PARTIAL",
      evidence: { sideEffectConfirmed: false, artifactIds: ["a1"] },
      summary: "partial",
    });
    expect(partial.notificationType).toBe("awaiting_review");
    expect(partial.userCompleteClaimAllowed).toBe(false);
    expect(partial.jobStatus).toBe("partially_completed");
  });

  it("RETRYING / UNKNOWN / timeout stay fail-closed", () => {
    const retrying = buildCanonicalExecutionResult({
      executionStatus: "RETRYING",
      evidence: { sideEffectConfirmed: false },
      summary: "retrying",
      attempt: 1,
      maxAttempts: 3,
    });
    expect(retrying.notificationType).toBe("automation");
    expect(retrying.userCompleteClaimAllowed).toBe(false);

    const unknown = buildCanonicalExecutionResult({
      executionStatus: "UNKNOWN",
      evidence: { sideEffectConfirmed: false },
      summary: "timeout",
      errorCode: "timeout_unknown",
    });
    expect(unknown.notificationType).toBe("error");
    expect(executionStatusFromJobStatus("failed")).toBe("FAILED");
  });

  it("artifact without storage and SNS without tweet are not SUCCESS", () => {
    const missingFile = evaluateCompletionEvidence({
      templateId: "document",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 1,
      snsPostFailure: null,
      storageUrl: null,
      artifactId: "art_x",
    });
    expect(missingFile.status).toBe("failed");

    const missingTweet = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      tweetId: null,
      tweetUrl: null,
    });
    expect(missingTweet.status).toBe("failed");
  });
});

describe("N-07 channel ACK taxonomy", () => {
  it("skipped is not delivered success", () => {
    const skipped = ackSkipped({ attempts: 1, reason: "not_configured" });
    expect(skipped.status).toBe("skipped");
    expect(skipped.sentCount).toBe(0);
    expect(skipped.softSuccess).toBe(false);
    expect(skipped.ok).toBe(true);

    const delivered = ackDelivered({ attempts: 1, sentCount: 1 });
    expect(delivered.status).toBe("delivered");
    expect(delivered.sentCount).toBe(1);

    const failed = ackFailed({ attempts: 3, error: "boom" });
    expect(failed.status).toBe("failed");
    expect(failed.ok).toBe(false);
  });
});

describe("N-07 production probe", () => {
  beforeEach(() => {
    process.env.ATLAS_NOTIFICATION_STORAGE = "memory_durable";
    process.env.ATLAS_AUTOMATION_STORAGE = "memory_durable";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    resetNotificationStore();
    resetDurableInboxForTests();
    resetSideEffectStoreForTests();
  });

  it("reports all required flags true in durable memory mode", async () => {
    const { probeN07SoftSuccessProduction } = await import(
      "@/lib/notifications/n07-soft-success-production-probe"
    );
    const result = await probeN07SoftSuccessProduction();
    if (!result.ok) {
      expect(result).toMatchObject({ ok: true, error: null });
    }
    expect(result.trueSuccessOk).toBe(true);
    expect(result.hardFailureOk).toBe(true);
    expect(result.partialFailureOk).toBe(true);
    expect(result.retryStateOk).toBe(true);
    expect(result.retrySuccessOk).toBe(true);
    expect(result.retryExhaustedFailureOk).toBe(true);
    expect(result.timeoutNotSuccessOk).toBe(true);
    expect(result.artifactMissingNotSuccessOk).toBe(true);
    expect(result.externalFailureNotSuccessOk).toBe(true);
    expect(result.jobNotificationConsistentOk).toBe(true);
    expect(result.historyNotificationConsistentOk).toBe(true);
    expect(result.notificationIdempotentOk).toBe(true);
    expect(result.multiInstanceOk).toBe(true);
    expect(result.crossUserIsolatedOk).toBe(true);
    expect(result.failClosedOk).toBe(true);
    expect(result.secretsRedactedOk).toBe(true);
    expect(result.ok).toBe(true);
  }, 60_000);
});
