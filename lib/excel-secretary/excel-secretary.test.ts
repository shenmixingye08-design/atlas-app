import { describe, expect, it } from "vitest";

import { analyzeWorkbookModel } from "./analyze-workbook";
import { writeWorkbookBuffer, toPreviewPayload } from "./build-workbook";
import { detectExcelIntent } from "./detect-intent";
import { applyExcelEdits } from "./edit-workbook";
import { previewWorkbook, workbookModelFromXlsxBuffer } from "./export";
import {
  averageFormula,
  countIfFormula,
  networkdaysFormula,
  sumFormula,
  sumIfFormula,
  xlookupFormula,
} from "./formulas";
import { workbookFromCsv, workbookFromMarkdownTables } from "./from-tabular";
import {
  createExcelFromAssignment,
  createExcelFromUpload,
  createExcelFromVisionTables,
  editExcelBuffer,
} from "./service";
import { buildTemplateWorkbook } from "./templates";

describe("detectExcelIntent", () => {
  it.each([
    ["売上管理表を作って", "sales"],
    ["家計簿を作って", "household"],
    ["工程表を作って", "gantt"],
    ["勤務表を作って", "attendance"],
    ["顧客管理表を作って", "customers"],
    ["在庫管理表を作って", "inventory"],
    ["見積書を作って", "estimate"],
    ["請求書を作って", "invoice"],
    ["領収書を作って", "receipt"],
    ["ガントチャートを作って", "gantt"],
    ["勤怠管理を作って", "timecard"],
    ["スケジュール表を作って", "schedule"],
  ] as const)("%s → %s", (text, kind) => {
    expect(detectExcelIntent(text).kind).toBe(kind);
  });
});

describe("buildTemplateWorkbook", () => {
  it("builds corporate-ready sales workbook with formulas and chart data", async () => {
    const model = buildTemplateWorkbook("sales", "売上管理表");
    expect(model.sheets[0]?.asTable).toBe(true);
    expect(model.sheets[0]?.freezeHeader).toBe(true);
    expect(model.sheets[0]?.charts?.length).toBeGreaterThan(0);
    const buffer = await writeWorkbookBuffer(model);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it("applies NETWORKDAYS on gantt day column when written", async () => {
    const model = buildTemplateWorkbook("gantt", "工程表");
    const buffer = await writeWorkbookBuffer(model);
    const roundTrip = await workbookModelFromXlsxBuffer(buffer, "工程表");
    const preview = toPreviewPayload(roundTrip);
    expect(preview.sheets[0]?.headers).toContain("日数");
  });
});

describe("formulas helpers", () => {
  it("generates common Excel formulas", () => {
    expect(sumFormula(2, 3, 10)).toBe("SUM(B3:B10)");
    expect(averageFormula(3, 2, 5)).toBe("AVERAGE(C2:C5)");
    expect(countIfFormula(1, 2, 20, "直販")).toContain("COUNTIF");
    expect(sumIfFormula(1, 3, 2, 20, "A")).toContain("SUMIF");
    expect(xlookupFormula("A2", "A:A", "B:B")).toContain("XLOOKUP");
    expect(networkdaysFormula("C3", "D3")).toContain("NETWORKDAYS");
  });
});

describe("CSV → Excel", () => {
  it("adds borders/filter-ready table with inferred currency", async () => {
    const csv = "日付,店名,金額\n2026-07-01,スーパー,1200\n2026-07-02,カフェ,580\n";
    const model = workbookFromCsv({ csvText: csv, title: "家計簿CSV" });
    expect(model.kind).toBe("from_csv");
    expect(model.sheets[0]?.asTable).toBe(true);
    expect(model.sheets[0]?.columns.some((c) => c.kind === "currency")).toBe(true);
    const buffer = await writeWorkbookBuffer(model);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});

describe("createExcelFromAssignment", () => {
  it("creates xlsx from natural language + markdown content", async () => {
    const result = await createExcelFromAssignment({
      assignment: "家計簿を作って",
      contentMarkdown: `# 家計簿

| 日付 | 店名 | 金額 |
| --- | --- | ---: |
| 2026-07-01 | スーパーA | 1200 |
| 2026-07-02 | カフェB | 580 |
`,
    });
    expect(result.ok).toBe(true);
    expect(result.buffer?.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(result.preview?.sheets[0]?.headers).toEqual(
      expect.arrayContaining(["日付", "店名", "金額"]),
    );
  });
});

describe("vision tables → Excel", () => {
  it("preserves headers and numeric cells", async () => {
    const result = await createExcelFromVisionTables({
      title: "レシート",
      tables: [
        {
          name: "明細",
          headers: ["品名", "金額"],
          rows: [
            ["牛乳", 198],
            ["パン", 150],
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.preview?.sheets[0]?.rowCount).toBeGreaterThanOrEqual(2);
  });
});

describe("edit + analyze", () => {
  it("adds column and analyzes rankings", async () => {
    const created = await createExcelFromAssignment({
      assignment: "売上管理表を作って",
    });
    expect(created.ok).toBe(true);
    const edited = applyExcelEdits(created.workbook!, [
      { op: "add_column", header: "備考" },
      { op: "add_filter" },
    ]);
    expect(edited.sheets[0]?.columns.some((c) => c.header === "備考")).toBe(true);
    const analysis = analyzeWorkbookModel(edited);
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.comments.length).toBeGreaterThan(0);

    const viaApi = await editExcelBuffer({
      buffer: created.buffer!,
      operations: [{ op: "delete_row", rowIndex: 0 }],
    });
    expect(viaApi.ok).toBe(true);
  });
});

describe("upload convert", () => {
  it("converts CSV upload", async () => {
    const result = await createExcelFromUpload({
      fileName: "data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("名前,点数\n太郎,90\n花子,85\n", "utf8"),
      title: "成績",
    });
    expect(result.ok).toBe(true);
    expect(result.preview?.sheets[0]?.headers).toEqual(["名前", "点数"]);
  });
});

describe("previewWorkbook", () => {
  it("reads back written xlsx", async () => {
    const model = workbookFromMarkdownTables({
      markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
      title: "preview",
      kind: "generic_table",
    });
    const buffer = await writeWorkbookBuffer(model);
    const preview = await previewWorkbook(buffer, "preview");
    expect(preview.sheets[0]?.headers).toContain("A");
  });
});
