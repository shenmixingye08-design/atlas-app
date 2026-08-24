import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { parseSpreadsheetFile } from "./parse-spreadsheet";

describe("deliverable batch spreadsheet file", () => {
  it("reads xlsx cached values and does not keep formulas executable", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("items");
    sheet.addRow(["タイトル", "固有指示"]);
    sheet.addRow(["商品A", "青"]);
    sheet.addRow(["商品B", { formula: "HYPERLINK(\"http://evil\")", result: "見た目" }]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseSpreadsheetFile({
      fileName: "items.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.parsed.items).toHaveLength(2);
    expect(parsed.rows.some((row) => String(Object.values(row)).includes("HYPERLINK"))).toBe(false);
  });

  it("rejects empty and oversized files", async () => {
    const empty = await parseSpreadsheetFile({
      fileName: "a.csv",
      buffer: Buffer.from(""),
    });
    expect(empty.ok).toBe(false);
  });
});
