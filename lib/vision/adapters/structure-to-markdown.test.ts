import { describe, expect, it } from "vitest";

import {
  documentStructureToMarkdown,
  repairVisionWordSeed,
  validateVisionWordSeed,
} from "./structure-to-markdown";
import type { VisionBatchResult } from "@/lib/vision/types";

describe("structure-to-markdown", () => {
  it("renders title, headings, lists, and tables for Word", () => {
    const md = documentStructureToMarkdown([
      { type: "title", text: "営業資料" },
      { type: "heading", level: 2, text: "概要" },
      { type: "paragraph", text: "お客様向けの提案です。" },
      { type: "bullet", items: ["速い", "正確"] },
      { type: "numbered", items: ["確認", "共有"] },
      {
        type: "table",
        headers: ["項目", "金額"],
        rows: [["A", 1000]],
      },
    ]);
    expect(md).toContain("# 営業資料");
    expect(md).toContain("## 概要");
    expect(md).toContain("- 速い");
    expect(md).toContain("1. 確認");
    expect(md).toContain("| 項目 | 金額 |");
  });

  it("repairs weak OCR dumps into structured Word seed", () => {
    const batch: VisionBatchResult = {
      id: "b1",
      images: [
        {
          id: "i1",
          attachmentId: "a1",
          detectedType: "business_document",
          confidence: 0.7,
          summary: "会議メモの写真です。",
          extractedText: "議題A 決定事項B",
          language: "ja",
          fields: { title: "会議メモ" },
          tables: [],
          documentStructure: [],
          visualElements: ["文字"],
          layout: { sections: ["議題", "決定"] },
          styleSignals: null,
          warnings: [],
          missingFields: [],
          recommendedActions: ["関係者へ共有"],
          artifactSuggestions: [],
          model: "t",
          detailLevel: "auto",
          createdAt: new Date().toISOString(),
        },
      ],
      combinedSummary: "会議メモの写真です。",
      commonFields: {},
      differences: [],
      mergedTables: [],
      warnings: [],
      recommendedArtifactType: null,
      status: "analyzed",
      model: "t",
      detailLevel: "auto",
      createdAt: new Date().toISOString(),
    };
    const repaired = repairVisionWordSeed("短い", batch);
    const check = validateVisionWordSeed(repaired);
    expect(check.ok).toBe(true);
    expect(repaired).toContain("# 会議メモ");
    expect(repaired).toContain("## ");
  });
});
