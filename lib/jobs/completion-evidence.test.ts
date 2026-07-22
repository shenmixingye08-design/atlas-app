import { describe, expect, it } from "vitest";

import { evaluateCompletionEvidence } from "./completion-evidence";

describe("completion evidence", () => {
  it("requires tweet proof for sns_post template", () => {
    const withProof = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      tweetId: "123",
      tweetUrl: "https://x.com/u/status/123",
    });
    expect(withProof.status).toBe("completed");
    expect(withProof.externalResultUrl).toContain("x.com");

    const withoutProof = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
    });
    expect(withoutProof.status).toBe("partially_completed");
    expect(withoutProof.resultSummary).toContain("証拠");
  });

  it("marks waiting_for_approval when not approved", () => {
    const result = evaluateCompletionEvidence({
      orchestrationStatus: "completed",
      approved: false,
      deliverableCount: 1,
      snsPostFailure: null,
      storageUrl: "https://example.com/file.pdf",
    });
    expect(result.status).toBe("waiting_for_approval");
    expect(result.resultSummary).toBe("確認待ち");
  });
});
