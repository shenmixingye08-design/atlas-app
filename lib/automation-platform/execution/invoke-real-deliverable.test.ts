import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const generateDeliverables = vi.fn();

vi.mock("@/lib/deliverables/engine", () => ({
  generateDeliverables: (...args: unknown[]) => generateDeliverables(...args),
}));

vi.mock("@/lib/billing/stripe/config", () => ({
  resolveAppOrigin: (fallback: string) => fallback || "http://localhost:3000",
}));

import { invokeRealDeliverableStep } from "./invoke-real-deliverable";

describe("invokeRealDeliverableStep", () => {
  const original = process.env.ATLAS_V2_REAL_DELIVERABLES;

  beforeEach(() => {
    generateDeliverables.mockReset();
    delete process.env.ATLAS_V2_REAL_DELIVERABLES;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ATLAS_V2_REAL_DELIVERABLES;
    } else {
      process.env.ATLAS_V2_REAL_DELIVERABLES = original;
    }
  });

  it("returns real downloadable artifacts and never url:null success", async () => {
    generateDeliverables.mockResolvedValue({
      deliverables: [
        {
          id: "dlv_1",
          fileName: "週次営業報告書.docx",
          format: "docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          generatedAt: "2026-08-02T00:00:00.000Z",
          sizeBytes: 1200,
          isPlaceholder: false,
          downloadUrl: "http://localhost:3000/api/deliverables/dlv_1",
        },
      ],
      detection: { formats: ["docx", "pdf"], matchedRule: "forced" },
      failures: [],
      jobId: "job_1",
    });

    const result = await invokeRealDeliverableStep({
      stepType: "word_generate",
      stepName: "週次報告書",
      configuration: {
        title: "週次営業報告書",
        documentType: "report",
      },
      userId: "user_1",
      automationName: "毎週営業レポート",
      runId: "run_1",
      assignmentNotes: "今週の商談3件と来週予定をまとめてください。",
      requestOrigin: "http://localhost:3000",
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.url).toBe(
      "http://localhost:3000/api/deliverables/dlv_1",
    );
    expect(generateDeliverables).toHaveBeenCalledOnce();
    const [input, origin, options] = generateDeliverables.mock.calls[0]!;
    expect(input.formats).toEqual(["docx", "pdf"]);
    expect(origin).toBe("http://localhost:3000");
    expect(options.userId).toBe("user_1");
    expect(options.contentAlreadyApproved).toBe(true);
  });

  it("fails closed when engine returns zero deliverables", async () => {
    generateDeliverables.mockResolvedValue({
      deliverables: [],
      detection: { formats: ["docx"], matchedRule: null },
      failures: [{ format: "docx", reasons: ["empty_deliverable"] }],
      jobId: "job_2",
    });

    const result = await invokeRealDeliverableStep({
      stepType: "word_generate",
      stepName: "報告書",
      configuration: { title: "報告書" },
      userId: "user_1",
      automationName: "レポート",
      runId: "run_2",
      requestOrigin: "http://localhost:3000",
    });

    expect(result.ok).toBe(false);
    expect(result.artifacts).toEqual([]);
    expect(result.errorCode).toBe("automation_run_failed");
  });

  it("fails closed on rollback flag (never stub-succeeds)", async () => {
    process.env.ATLAS_V2_REAL_DELIVERABLES = "false";
    const result = await invokeRealDeliverableStep({
      stepType: "word_generate",
      stepName: "報告書",
      configuration: { title: "報告書" },
      userId: "user_1",
      automationName: "レポート",
      runId: "run_3",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("automation_feature_disabled");
    expect(generateDeliverables).not.toHaveBeenCalled();
  });
});
