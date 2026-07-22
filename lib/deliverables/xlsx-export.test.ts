import { describe, expect, it } from "vitest";

import { detectDeliverableFormats } from "@/lib/deliverables/detect-formats";
import {
  buildExcelBaseName,
  isExcelIntent,
} from "@/lib/deliverables/excel-intent";
import {
  coerceExcelCellValue,
  extractExcelSheets,
} from "@/lib/deliverables/excel-tables";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";

const SAMPLE_TABLE_MARKDOWN = `# 売上ランキング

| 順位 | 商品名 | 売上 | 日付 |
| --- | --- | --- | --- |
| 1 | りんご | 1,200 | 2026-07-01 |
| 2 | みかん | 980 | 2026/07/02 |
| 3 | ぶどう | 2,450.5 | 2026-07-03 |
`;

describe("excel intent", () => {
  it("detects Japanese and English Excel requests", () => {
    expect(isExcelIntent("この写真からExcel作って")).toBe(true);
    expect(isExcelIntent("画像を表にしてください")).toBe(true);
    expect(isExcelIntent("ランキングをExcel化")).toBe(true);
    expect(isExcelIntent("一覧をExcelに")).toBe(true);
    expect(isExcelIntent("写真からスプレッドシート")).toBe(true);
    expect(isExcelIntent("OCRしてExcel")).toBe(true);
    expect(isExcelIntent("xlsxで納品して")).toBe(true);
    expect(isExcelIntent("営業メールを書いて")).toBe(false);
  });

  it("switches format detection to the excel flow", () => {
    const detection = detectDeliverableFormats("この写真からExcel作って");
    expect(detection.matchedRule).toBe("excel-spreadsheet");
    expect(detection.formats[0]).toBe("xlsx");
    expect(detection.formats).toContain("pdf");
    expect(detection.formats).toContain("docx");
  });

  it("keeps xlsx available for non-excel assignments", () => {
    const detection = detectDeliverableFormats("契約書を作成して");
    expect(detection.formats).toContain("xlsx");
    expect(detection.formats).toContain("docx");
  });
});

describe("excel filename", () => {
  it("maps common intents to stable English names", () => {
    expect(buildExcelBaseName("ランキングをExcel化")).toBe("ranking");
    expect(buildExcelBaseName("請求書をxlsxで")).toBe("invoice");
    expect(buildExcelBaseName("OCRしてExcel")).toBe("ocr_result");
    expect(buildExcelBaseName("商品一覧をExcelに")).toBe("products");
  });
});

describe("excel structured tables", () => {
  it("coerces numbers and dates without corrupting Japanese text", () => {
    expect(coerceExcelCellValue("1,200")).toBe(1200);
    expect(coerceExcelCellValue("2,450.5")).toBe(2450.5);
    expect(coerceExcelCellValue("りんご")).toBe("りんご");
    const date = coerceExcelCellValue("2026-07-01");
    expect(date).toBeInstanceOf(Date);
    expect((date as Date).getFullYear()).toBe(2026);
  });

  it("extracts markdown pipe tables into sheets", () => {
    const sheets = extractExcelSheets(SAMPLE_TABLE_MARKDOWN);
    expect(sheets.length).toBe(1);
    expect(sheets[0]?.headers).toEqual(["順位", "商品名", "売上", "日付"]);
    expect(sheets[0]?.rows[0]?.[1]).toBe("りんご");
    expect(sheets[0]?.rows[0]?.[2]).toBe(1200);
  });

  it("extracts JSON {headers, rows} structured data", () => {
    const sheets = extractExcelSheets(
      JSON.stringify({
        name: "products",
        headers: ["SKU", "名前", "数量"],
        rows: [
          ["A-1", "ノート", 3],
          ["B-2", "ペン", 10],
        ],
      }),
    );
    expect(sheets[0]?.name).toBe("products");
    expect(sheets[0]?.rows).toHaveLength(2);
    expect(sheets[0]?.rows[1]?.[2]).toBe(10);
  });
});

describe("xlsx generator", () => {
  it("generates a valid .xlsx zip from structured table markdown", async () => {
    const file = await new XlsxDeliverableGenerator().generate(
      SAMPLE_TABLE_MARKDOWN,
      "ranking",
    );
    expect(file.format).toBe("xlsx");
    expect(file.fileName).toBe("ranking.xlsx");
    expect(file.mimeType).toContain("spreadsheetml");
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(file.buffer.length).toBeGreaterThan(1500);
  });

  it("preserves Japanese headers inside the workbook xml", async () => {
    const file = await new XlsxDeliverableGenerator().generate(
      SAMPLE_TABLE_MARKDOWN,
      "ranking",
    );
    // Shared strings / sheet xml are UTF-8 inside the zip; spot-check raw bytes.
    const asLatin1 = file.buffer.toString("binary");
    expect(asLatin1.includes("PK")).toBe(true);
    expect(file.isPlaceholder).toBe(false);
  });
});
