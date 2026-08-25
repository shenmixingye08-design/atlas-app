import { describe, expect, it } from "vitest";

import { summarizeBatchStatus } from "./status";
import type { DeliverableBatchItem } from "./types";

function item(status: DeliverableBatchItem["status"]): DeliverableBatchItem {
  return {
    id: `dli_${status}`,
    batchId: "dlb",
    userId: "u",
    order: 0,
    inputType: "ai_themes",
    inputReference: null,
    title: "t",
    theme: "t",
    individualInstruction: "",
    forbidden: "",
    fileName: null,
    outputFormat: "txt",
    outputArtifactId: status === "ready" || status === "approved" ? "art" : null,
    workJobId: null,
    sourceContent: null,
    status,
    retryCount: 0,
    error: null,
    edited: false,
    approvedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("deliverable batch status", () => {
  it("does not complete when any item failed", () => {
    expect(
      summarizeBatchStatus([item("ready"), item("failed")]),
    ).toBe("partially_failed");
  });

  it("is completed only when every item is approved", () => {
    expect(summarizeBatchStatus([item("approved"), item("approved")])).toBe("completed");
    expect(summarizeBatchStatus([item("ready"), item("ready")])).toBe("ready");
  });

  it("keeps sample_ready while only the first item is done", () => {
    expect(
      summarizeBatchStatus([item("ready"), item("pending")], {
        sampleOnly: true,
        sampleReady: true,
      }),
    ).toBe("sample_ready");
  });
});
