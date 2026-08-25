import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyCommon } from "./compose";

const consume = vi.fn();
const generateDeliverables = vi.fn();
const getStored = vi.fn();

vi.mock("@/lib/billing/access", () => ({
  requireAndConsumeAiJob: (...args: unknown[]) => consume(...args),
}));

vi.mock("@/lib/deliverables/engine", () => ({
  generateDeliverables: (...args: unknown[]) => generateDeliverables(...args),
}));

vi.mock("@/lib/deliverables/store", () => ({
  getStoredDeliverableForUser: (...args: unknown[]) => getStored(...args),
}));

describe("deliverable batch generate", () => {
  beforeEach(() => {
    consume.mockReset();
    generateDeliverables.mockReset();
    getStored.mockReset();
    consume.mockResolvedValue(null);
    generateDeliverables.mockResolvedValue({
      deliverables: [
        { id: "art_1", format: "txt", fileName: "a.txt", isPlaceholder: false },
      ],
      failures: [],
    });
    getStored.mockResolvedValue({ buffer: Buffer.from("hello world"), fileName: "a.txt" });
  });

  it("consumes AI quota once per item retry and skips empty storage", async () => {
    const { generateDeliverableBatchItemArtifact } = await import("./generate");
    const batch = {
      id: "dlb",
      userId: "u1",
      name: "b",
      inputType: "line_list" as const,
      common: emptyCommon(),
      format: "txt" as const,
      requestedCount: 1,
      status: "generating" as const,
      sampleItemId: null,
      sampleApproved: false,
      sampleStyleNote: null,
      styleCandidate: null,
      duplicateWarnings: [],
      cancelled: false,
      createdAt: "",
      updatedAt: "",
    };
    const item = {
      id: "dli",
      batchId: "dlb",
      userId: "u1",
      order: 0,
      inputType: "line_list" as const,
      inputReference: "商品A",
      title: "商品A",
      theme: "商品A",
      individualInstruction: "商品Aの説明を丁寧に。入力以外の実績は書かない。",
      forbidden: "",
      fileName: null,
      outputFormat: "txt" as const,
      outputArtifactId: null,
      workJobId: null,
      sourceContent: null,
      status: "generating" as const,
      retryCount: 0,
      error: null,
      edited: false,
      approvedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const first = await generateDeliverableBatchItemArtifact({
      userId: "u1",
      batch,
      item,
      assignment: "a",
      origin: "http://local",
    });
    expect(first.ok).toBe(true);
    expect(consume).toHaveBeenCalledWith(
      "u1",
      "deliverables_generate",
      "deliverable-batch:dlb:dli:0",
    );
    expect(generateDeliverables).toHaveBeenCalledTimes(1);
    expect(generateDeliverables.mock.calls[0]?.[2]?.contentAlreadyApproved).toBe(true);

    getStored.mockResolvedValueOnce({ buffer: Buffer.alloc(0), fileName: "a.txt" });
    const broken = await generateDeliverableBatchItemArtifact({
      userId: "u1",
      batch,
      item: { ...item, retryCount: 1 },
      assignment: "a",
      origin: "http://local",
    });
    expect(broken.ok).toBe(false);
    expect(consume).toHaveBeenCalledWith(
      "u1",
      "deliverables_generate",
      "deliverable-batch:dlb:dli:1",
    );
  });

  it("does not mark ready when another user cannot read storage", async () => {
    const { generateDeliverableBatchItemArtifact } = await import("./generate");
    getStored.mockResolvedValue(null);
    const result = await generateDeliverableBatchItemArtifact({
      userId: "u2",
      batch: {
        id: "dlb",
        userId: "u2",
        name: "b",
        inputType: "line_list",
        common: emptyCommon(),
        format: "txt",
        requestedCount: 1,
        status: "generating",
        sampleItemId: null,
        sampleApproved: false,
        sampleStyleNote: null,
        styleCandidate: null,
        duplicateWarnings: [],
        cancelled: false,
        createdAt: "",
        updatedAt: "",
      },
      item: {
        id: "dli",
        batchId: "dlb",
        userId: "u2",
        order: 0,
        inputType: "line_list",
        inputReference: null,
        title: "商品A",
        theme: "商品A",
        individualInstruction: "説明を書いてください。事実は入力だけ。",
        forbidden: "",
        fileName: null,
        outputFormat: "txt",
        outputArtifactId: null,
        workJobId: null,
        sourceContent: null,
        status: "generating",
        retryCount: 0,
        error: null,
        edited: false,
        approvedAt: null,
        createdAt: "",
        updatedAt: "",
      },
      assignment: "a",
      origin: "http://local",
    });
    expect(result.ok).toBe(false);
  });
});
