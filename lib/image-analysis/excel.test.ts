import { describe, expect, it } from "vitest";

import { analysisToCsv, analysisToXlsxBuffer, sanitizeSheetName } from "./excel";
import type { TableImageAnalysis } from "./types";

const sampleTable: TableImageAnalysis = {
  documentType: "table",
  title: "ランキング",
  confidence: 0.92,
  requiresReview: false,
  sourceFileId: "img1",
  sourceFiles: [],
  createdAt: "2026-07-22T00:00:00.000Z",
  warnings: [],
  fields: { columns: ["順位", "商品名", "スコア"] },
  rows: [
    { 順位: 1, 商品名: "サンプルA", スコア: 95 },
    { 順位: 2, 商品名: "要確認", スコア: null },
  ],
};

describe("excel helpers", () => {
  it("sanitizes illegal sheet name characters", () => {
    expect(sanitizeSheetName("A/B:C*D?E[F]G")).not.toMatch(/[\\/*?:\[\]]/);
    expect(sanitizeSheetName("あ".repeat(50)).length).toBeLessThanOrEqual(31);
  });

  it("builds a real xlsx buffer from structured table JSON", async () => {
    const buffer = await analysisToXlsxBuffer(sampleTable);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // ZIP/XLSX signature
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("builds UTF-8 BOM CSV with japanese headers", () => {
    const csv = analysisToCsv(sampleTable);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("順位");
    expect(csv).toContain("サンプルA");
  });
});
