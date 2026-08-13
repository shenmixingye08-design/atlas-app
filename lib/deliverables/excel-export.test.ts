import { describe, expect, it } from "vitest";

import {
  assignmentIsImageToExcel,
  assignmentRequestsExcel,
  contentHasMarkdownTable,
  extractExcelSheets,
  shouldGenerateXlsx,
} from "@/lib/deliverables/excel-data";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { resolveGenerationFormats } from "@/lib/deliverables/resolve-formats";

const TABLE_MARKDOWN = `# 家計簿

| 日付 | 店名 | 金額 |
| --- | --- | ---: |
| 2026-07-01 | スーパーA | 1200 |
| 2026-07-02 | カフェB | 580 |
`;

describe("excel-data", () => {
  it("detects excel and image-to-excel assignments", () => {
    expect(assignmentRequestsExcel("レシートをExcelにまとめて")).toBe(true);
    expect(
      assignmentIsImageToExcel("【添付】receipt.jpg\n画像をエクセルにしてください"),
    ).toBe(true);
    expect(assignmentIsImageToExcel("ブログ記事を書いて")).toBe(false);
  });

  it("detects markdown tables", () => {
    expect(contentHasMarkdownTable(TABLE_MARKDOWN)).toBe(true);
    expect(contentHasMarkdownTable("見出しだけ")).toBe(false);
  });

  it("extracts sheet rows from markdown tables", () => {
    const sheets = extractExcelSheets(TABLE_MARKDOWN);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.headers).toEqual(["日付", "店名", "金額"]);
    expect(sheets[0]?.rows).toEqual([
      ["2026-07-01", "スーパーA", "1200"],
      ["2026-07-02", "カフェB", "580"],
    ]);
  });

  it("extracts JSON sheets, drops empty columns, and maps low confidence to 要確認", () => {
    const json = JSON.stringify({
      headers: ["日付", "店名", "金額", ""],
      rows: [
        ["2026-07-01", "A店", "1200", ""],
        ["2026-07-02", "B店", "800", ""],
      ],
      confidence: [
        [0.9, 0.9, 0.9, 1],
        [0.2, 0.9, 0.9, 1],
      ],
    });
    const sheets = extractExcelSheets(json);
    expect(sheets[0]?.headers).toEqual(["日付", "店名", "金額"]);
    expect(sheets[0]?.rows[1]?.[0]).toBe("要確認");
    expect(sheets[0]?.rows[1]?.[1]).toBe("B店");
  });

  it("falls back to 項目/内容 when no table exists", () => {
    const sheets = extractExcelSheets("# タイトル\n\n本文です");
    expect(sheets[0]?.headers).toEqual(["項目", "内容"]);
    expect(sheets[0]?.rows.some((row) => row.includes("タイトル"))).toBe(true);
  });
});

describe("resolveGenerationFormats + xlsx", () => {
  it("selects xlsx for excel keywords", () => {
    const result = resolveGenerationFormats("内容をExcelへ整理してください");
    expect(result.formats).toContain("xlsx");
    expect(result.matchedRule).toBe("excel");
  });

  it("adds xlsx when content has tables", () => {
    const result = resolveGenerationFormats("資料を整理", undefined, TABLE_MARKDOWN);
    expect(result.formats).toContain("xlsx");
  });

  it("forces xlsx for image-to-excel even with format override", () => {
    const result = resolveGenerationFormats(
      "写真をエクセルにまとめて",
      ["pdf", "docx"],
      TABLE_MARKDOWN,
    );
    expect(result.formats[0]).toBe("xlsx");
    expect(result.formats).toContain("pdf");
    expect(result.formats).toContain("docx");
  });

  it("keeps plain override when excel is not requested", () => {
    const result = resolveGenerationFormats("営業資料", ["md"]);
    expect(result.formats).toEqual(["md"]);
    expect(result.matchedRule).toBe("user_selected_formats");
  });
});

describe("XlsxDeliverableGenerator", () => {
  it("generates a valid xlsx buffer with Japanese table data", async () => {
    const file = await new XlsxDeliverableGenerator().generate(
      TABLE_MARKDOWN,
      "家計簿",
    );
    expect(file.format).toBe("xlsx");
    expect(file.fileName).toBe("家計簿.xlsx");
    expect(file.mimeType).toContain("spreadsheetml");
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(file.buffer.length).toBeGreaterThan(1000);
    expect(shouldGenerateXlsx("Excelにして", TABLE_MARKDOWN)).toBe(true);
  });
});
