import { describe, expect, it } from "vitest";

import { detectDocumentType } from "@/lib/documents/classify/detect-document-type";
import { recommendOutputFormat } from "@/lib/documents/classify/recommend-format";
import { normalizeToDocumentModel } from "@/lib/documents/normalize";
import { renderDocumentModelToXlsx } from "@/lib/documents/render/xlsx/xlsx-renderer";
import { sanitizeExcelCell } from "@/lib/documents/render/xlsx/sanitize-cell";
import {
  validateDocxBuffer,
  validatePdfBuffer,
  validateXlsxBuffer,
} from "@/lib/documents/validate";
import { buildDocxBufferFromParsed } from "@/lib/deliverables/generators/docx-generator";
import { buildPdfBufferFromParsed } from "@/lib/deliverables/generators/pdf-generator";
import { documentModelToParsedDeliverable } from "@/lib/documents/render/bridge";
import { DOCUMENT_MODEL_SCHEMA_VERSION } from "@/lib/documents/schema/enums";

const PROPOSAL_TEXT = `# 新サービス提案書

## 背景
市場調査の結果、需要が拡大しています。

## 提案内容
- 機能Aの提供
- サポート体制の強化

| 項目 | 金額 | 備考 |
| --- | --- | --- |
| 初期費用 | ¥500,000 | 税別 |
| 月額 | ¥50,000 | 12ヶ月契約 |
`;

const MINUTES_TEXT = `# 定例議事録

## 決定事項
- 来週月曜に再開
- 資料は金曜まで

## アクション
- 田中: 見積取得（3/15まで）
`;

const COMPARISON_TABLE = `# 見積比較

| 項目 | A社 | B社 | C社 |
| --- | --- | --- | --- |
| 初期費用 | 100000 | 120000 | 90000 |
| 月額 | 5000 | 4500 | 5500 |
| サポート | 24h | 平日 | 24h |
| 納期 | 2週 | 3週 | 2週 |
| 評価 | ★4 | ★3 | ★5 |
| 備考 | - | 割引あり | 実績豊富 |
| 契約期間 | 12ヶ月 | 12ヶ月 | 6ヶ月 |
| 保守 | 込 | 別 | 込 |
`;

describe("normalizeToDocumentModel", () => {
  it("detects minutes and parses sections", () => {
    const model = normalizeToDocumentModel(MINUTES_TEXT);
    expect(model.documentType).toBe("minutes");
    expect(model.title).toBe("定例議事録");
    expect(model.schemaVersion).toBe(DOCUMENT_MODEL_SCHEMA_VERSION);
    expect(model.sections.some((s) => s.heading.includes("決定"))).toBe(true);
  });

  it("parses markdown tables", () => {
    const model = normalizeToDocumentModel(PROPOSAL_TEXT);
    const tables = model.sections.flatMap((s) =>
      s.blocks.filter((b) => b.type === "table"),
    );
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0]?.type === "table" && tables[0].headers).toContain("項目");
  });

  it("strips chat fluff lines", () => {
    const model = normalizeToDocumentModel("了解しました。\n# 報告書\n\n本文です。");
    expect(model.title).toBe("報告書");
    expect(model.documentType).toBe("report");
  });
});

describe("detectDocumentType", () => {
  it("classifies comparison and estimate", () => {
    expect(detectDocumentType("見積比較表")).toBe("comparison");
    expect(detectDocumentType("見積書の作成")).toBe("estimate");
  });
});

describe("recommendOutputFormat", () => {
  it("recommends Excel for large tables", () => {
    const model = normalizeToDocumentModel(COMPARISON_TABLE);
    const rec = recommendOutputFormat(model);
    expect(rec.recommended).toBe("xlsx");
  });

  it("recommends Word for minutes", () => {
    const model = normalizeToDocumentModel(MINUTES_TEXT);
    expect(recommendOutputFormat(model).recommended).toBe("docx");
  });
});

describe("formula injection guard", () => {
  it("prefixes dangerous cell values", () => {
    expect(sanitizeExcelCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeExcelCell("+123")).toBe("'+123");
    expect(sanitizeExcelCell("-100")).toBe("'-100");
    expect(sanitizeExcelCell("@import")).toBe("'@import");
    expect(sanitizeExcelCell("通常テキスト")).toBe("通常テキスト");
  });
});

describe("binary generators and validation", () => {
  it("generates valid docx for proposal fixture", async () => {
    const model = normalizeToDocumentModel(PROPOSAL_TEXT);
    const parsed = documentModelToParsedDeliverable(model);
    const buffer = await buildDocxBufferFromParsed(parsed);
    const validation = validateDocxBuffer(buffer);
    expect(validation.valid).toBe(true);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("generates valid Japanese PDF", async () => {
    const model = normalizeToDocumentModel(PROPOSAL_TEXT);
    const parsed = documentModelToParsedDeliverable(model);
    const buffer = await buildPdfBufferFromParsed(parsed, PROPOSAL_TEXT);
    const validation = validatePdfBuffer(buffer);
    expect(validation.valid).toBe(true);
    expect(validation.pageCount).toBeGreaterThan(0);
    expect(buffer.toString("latin1")).not.toContain("Helvetica");
  });

  it("generates valid xlsx with sheets", async () => {
    const model = normalizeToDocumentModel(COMPARISON_TABLE);
    const buffer = await renderDocumentModelToXlsx(model);
    const validation = await validateXlsxBuffer(buffer);
    expect(validation.valid).toBe(true);
    expect(validation.sheetCount).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("handles 50+ row table with money and dates", async () => {
    const rows = Array.from({ length: 55 }, (_, i) =>
      `| ${i + 1} | 2025/03/${String((i % 28) + 1).padStart(2, "0")} | ¥${(i + 1) * 1000} | ${(i % 100).toFixed(1)}% |`,
    );
    const text = `# 売上一覧\n\n| No | 日付 | 金額 | 比率 |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
    const model = normalizeToDocumentModel(text);
    const buffer = await renderDocumentModelToXlsx(model);
    const validation = await validateXlsxBuffer(buffer);
    expect(validation.valid).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

/** Office/Android open tests: 未確認 — CI has no Microsoft Office or Android device. */
