import { describe, expect, it } from "vitest";

import {
  buildBatchManifest,
  createDeliverableBatchZip,
  safeZipEntryName,
} from "./zip";
import type { DeliverableBatch, DeliverableBatchItem } from "./types";

function batch(): DeliverableBatch {
  return {
    id: "dlb_1",
    userId: "user_a",
    name: "納品セット",
    inputType: "line_list",
    common: {
      purpose: "",
      audience: "",
      tone: "",
      length: "",
      structure: "",
      template: "",
      mustInclude: "",
      forbidden: "",
      fileNameRule: "",
    },
    format: "txt",
    requestedCount: 2,
    status: "ready",
    sampleItemId: null,
    sampleApproved: true,
    sampleStyleNote: null,
    styleCandidate: null,
    duplicateWarnings: [],
    cancelled: false,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

function item(partial: Partial<DeliverableBatchItem>): DeliverableBatchItem {
  return {
    id: "dli_1",
    batchId: "dlb_1",
    userId: "user_a",
    order: 0,
    inputType: "line_list",
    inputReference: "商品A",
    title: "商品A",
    theme: "商品A",
    individualInstruction: "商品A",
    forbidden: "",
    fileName: "a.txt",
    outputFormat: "txt",
    outputArtifactId: "art_1",
    workJobId: null,
    sourceContent: "本文",
    status: "ready",
    retryCount: 0,
    error: null,
    edited: false,
    approvedAt: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...partial,
  };
}

describe("deliverable batch zip", () => {
  it("blocks path traversal and duplicates names", () => {
    const used = new Set<string>();
    expect(safeZipEntryName("../../etc/passwd", used)).toBe("etc_passwd");
    expect(safeZipEntryName("..\\secret", used)).toBe("secret");
    expect(safeZipEntryName("note.txt", used)).toBe("note.txt");
    expect(safeZipEntryName("note.txt", used)).toBe("note-2.txt");
  });

  it("builds a manifest without secrets and a zip with readme", () => {
    const current = batch();
    const items = [
      item({ id: "dli_1", title: "A", fileName: "a.txt", status: "ready" }),
      item({ id: "dli_2", order: 1, title: "B", fileName: "b.txt", status: "failed" }),
    ];
    const manifest = buildBatchManifest(current, items);
    expect(manifest).toContain("納品セット");
    expect(manifest).toContain("successCount");
    expect(manifest).not.toContain("OPENAI");
    expect(manifest).not.toContain("prompt");
    expect(manifest).not.toContain("sk-");

    const zip = createDeliverableBatchZip({
      batch: current,
      items,
      files: [
        { itemId: "dli_1", fileName: "../evil.txt", data: new TextEncoder().encode("ok") },
      ],
    });
    expect(zip.byteLength).toBeGreaterThan(20);
    const asText = new TextDecoder().decode(zip);
    expect(asText).toContain("manifest.json");
    expect(asText).toContain("README.txt");
    expect(asText).not.toContain("../evil");
  });
});
