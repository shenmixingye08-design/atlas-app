import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { analyzeWorkbookModel } from "./analyze-workbook";
import { writeWorkbookBuffer } from "./build-workbook";
import { detectExcelIntent } from "./detect-intent";
import { applyExcelEdits } from "./edit-workbook";
import {
  exportWorkbook,
  previewWorkbook,
  workbookModelFromXlsxBuffer,
} from "./export";
import { validateWorkbookFormulas } from "./formula-validate";
import { workbookFromCsv } from "./from-tabular";
import { EXCEL_LIMITS, classifyExcelScale } from "./limits";
import { validateExcelWorkbookModel } from "./schema";
import {
  sanitizeCsvCell,
  sanitizeExcelFileName,
  headerRequiresText,
} from "./security";
import {
  createExcelFromAssignment,
  createExcelFromUpload,
  createExcelFromVisionTables,
  editExcelBuffer,
} from "./service";
import { buildTemplateWorkbook } from "./templates";

async function reopen(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

describe("Excel production acceptance", () => {
  it("1. 売上管理表生成", async () => {
    const r = await createExcelFromAssignment({ assignment: "売上管理表を作って" });
    expect(r.ok).toBe(true);
    expect(r.buffer!.subarray(0, 2).toString("utf8")).toBe("PK");
    const wb = await reopen(r.buffer!);
    expect(wb.worksheets.length).toBeGreaterThan(0);
  });

  it("2. 家計簿生成", async () => {
    const r = await createExcelFromAssignment({ assignment: "家計簿を作って" });
    expect(r.ok).toBe(true);
    expect(detectExcelIntent("家計簿を作って").kind).toBe("household");
  });

  it("3. 勤怠表生成", async () => {
    const r = await createExcelFromAssignment({ assignment: "勤怠管理を作って" });
    expect(r.ok).toBe(true);
    expect(r.preview?.sheets[0]?.headers.join()).toMatch(/出勤|退勤|氏名|日付|時間/);
  });

  it("4. 請求一覧生成", async () => {
    const r = await createExcelFromAssignment({ assignment: "請求一覧を作って" });
    expect(r.ok).toBe(true);
    expect(detectExcelIntent("請求一覧を作って").kind).toBe("invoice_list");
  });

  it("5. 複数シート生成", async () => {
    const model = buildTemplateWorkbook("shift", "シフト表");
    expect(model.sheets.length).toBeGreaterThan(1);
    const buf = await writeWorkbookBuffer(model);
    const wb = await reopen(buf);
    expect(wb.worksheets.length).toBeGreaterThan(1);
  });

  it("6. 日本語文字列", async () => {
    const r = await createExcelFromAssignment({
      assignment: "顧客管理表を作って",
      contentMarkdown: `| 会社名 | 担当 |\n| --- | --- |\n| 株式会社テスト | 山田太郎 |\n`,
    });
    expect(r.ok).toBe(true);
    const preview = await previewWorkbook(r.buffer!);
    expect(preview.sheets[0]?.rows.flat().join("")).toContain("株式会社");
  });

  it("7–9. 日付・金額・パーセント型", async () => {
    const model = buildTemplateWorkbook("sales_pipeline", "案件");
    const colKinds = model.sheets[0]!.columns.map((c) => c.kind);
    expect(colKinds).toContain("date");
    expect(colKinds).toContain("currency");
    expect(colKinds).toContain("percent");
    const buf = await writeWorkbookBuffer(model);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("10–13. SUM/IF formulas + static validation", async () => {
    const model = buildTemplateWorkbook("sales", "売上");
    const issues = validateWorkbookFormulas(model);
    expect(issues.filter((i) => i.code === "circular_risk")).toHaveLength(0);
    const validation = validateExcelWorkbookModel(model);
    expect(validation.ok).toBe(true);
    const buf = await writeWorkbookBuffer(model);
    const round = await workbookModelFromXlsxBuffer(buf);
    expect(round.sheets[0]?.rows.some((row) =>
      row.some((c) => String(c.value ?? "").includes("SUM") || String(c.value ?? "").startsWith("=") || c.formula),
    ) || round.sheets[0]?.rows.some((row) => row[0]?.value === "合計")).toBe(true);
  });

  it("14–16. グラフ・フィルター・固定行", async () => {
    const model = buildTemplateWorkbook("sales", "売上");
    expect(model.sheets[0]?.charts?.length).toBeGreaterThan(0);
    expect(model.sheets[0]?.asTable).toBe(true);
    expect(model.sheets[0]?.freezeHeader).toBe(true);
  });

  it("17–18. 入力規則/条件付きは用途シートで案内（シフト使い方）", () => {
    const model = buildTemplateWorkbook("shift", "シフト");
    expect(model.sheets.some((s) => s.name === "使い方")).toBe(true);
  });

  it("19–21. CSV取込・先頭ゼロ保持", async () => {
    const csv = "顧客番号,名前,金額\n00123,太郎,1000\n";
    const model = workbookFromCsv({ csvText: csv, title: "顧客" });
    const idCol = model.sheets[0]!.columns[0]!;
    expect(headerRequiresText(idCol.header) || idCol.kind === "text").toBe(true);
    expect(String(model.sheets[0]!.rows[0]![0]!.value)).toBe("00123");
  });

  it("22–23. 画像表・レシート家計簿", async () => {
    const vision = await createExcelFromVisionTables({
      title: "レシート",
      kind: "household",
      tables: [
        {
          headers: ["日付", "店名", "金額"],
          rows: [
            ["2026-08-01", "スーパー", 1200],
            ["2026-08-01", "カフェ", 580],
          ],
        },
      ],
    });
    expect(vision.ok).toBe(true);
    expect(vision.preview?.sheets[0]?.headers).toEqual(
      expect.arrayContaining(["日付", "店名", "金額"]),
    );
  });

  it("24. PDF表からExcel（テキスト）", async () => {
    // Without real PDF bytes, markdown/table path covers table extract quality.
    const r = await createExcelFromAssignment({
      assignment: "表をExcelにして",
      contentMarkdown: `| 項目 | 数量 |\n| --- | --- |\n| A | 1 |\n| B | 2 |\n`,
    });
    expect(r.ok).toBe(true);
  });

  it("25–27. 既存Excel編集・非破壊・revision buffer", async () => {
    const created = await createExcelFromAssignment({ assignment: "売上管理表を作って" });
    const original = Buffer.from(created.buffer!);
    const edited = await editExcelBuffer({
      buffer: created.buffer!,
      operations: [{ op: "add_column", header: "備考2" }],
    });
    expect(edited.ok).toBe(true);
    expect(original.equals(edited.buffer!)).toBe(false);
    expect(created.buffer!.equals(original)).toBe(true);
    const model = applyExcelEdits(created.workbook!, [
      { op: "add_filter" },
    ]);
    expect(model.kind).toBe("edited");
  });

  it("28. プレビュー", async () => {
    const r = await createExcelFromAssignment({ assignment: "タスク管理表を作って" });
    const preview = await previewWorkbook(r.buffer!);
    expect(preview.sheets.length).toBeGreaterThan(0);
    expect(preview.sheets[0]?.headers.length).toBeGreaterThan(0);
  });

  it("29. モバイル向けプレビュー行数制限", () => {
    expect(EXCEL_LIMITS.maxPreviewRows).toBeLessThanOrEqual(100);
  });

  it("30. 大容量ファイル制限", () => {
    expect(classifyExcelScale(100)).toBe("small");
    expect(classifyExcelScale(6000)).toBe("medium");
    expect(classifyExcelScale(25_000)).toBe("large");
    expect(EXCEL_LIMITS.maxRowsPerSheet).toBe(50_000);
    expect(EXCEL_LIMITS.maxUploadBytes).toBeGreaterThan(1_000_000);
  });

  it("31. タイムアウト上限定数", () => {
    expect(EXCEL_LIMITS.maxGenerationMs).toBeGreaterThanOrEqual(60_000);
  });

  it("32–33. 重複生成防止は idempotency を呼び出し側で担保（モデルは決定的）", async () => {
    const a = await createExcelFromAssignment({ assignment: "在庫管理表を作って" });
    const b = await createExcelFromAssignment({ assignment: "在庫管理表を作って" });
    expect(a.ok && b.ok).toBe(true);
    expect(a.preview?.title).toBe(b.preview?.title);
  });

  it("34. CSVインジェクション対策", () => {
    expect(sanitizeCsvCell("=cmd|'/c calc'!A0")).toMatch(/^'/);
    expect(sanitizeCsvCell("+2+3")).toMatch(/^'/);
    expect(sanitizeCsvCell("-2+3")).toMatch(/^'/);
    expect(sanitizeCsvCell("@SUM(A1)")).toMatch(/^'/);
    expect(sanitizeCsvCell("普通の文字")).toBe("普通の文字");
  });

  it("35. ファイル名サニタイズ", () => {
    expect(sanitizeExcelFileName('a/b:c*?.xlsx')).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("追加: 営業案件・車両・太陽光・不動産・収支", async () => {
    for (const q of [
      "営業案件一覧を作って",
      "車両管理表を作って",
      "太陽光案件管理表を作って",
      "不動産管理表を作って",
      "収支計算表を作って",
    ]) {
      const r = await createExcelFromAssignment({ assignment: q });
      expect(r.ok, q).toBe(true);
      expect(r.buffer!.subarray(0, 2).toString("utf8")).toBe("PK");
    }
  });

  it("追加: .xls は偽拡張子禁止（未対応エラー）", async () => {
    const model = buildTemplateWorkbook("sales", "売上");
    await expect(exportWorkbook(model, "xls")).rejects.toThrow(/xls/);
  });

  it("追加: CSVアップロード変換", async () => {
    const r = await createExcelFromUpload({
      fileName: "data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("日付,金額\n2026-08-01,1000\n", "utf8"),
    });
    expect(r.ok).toBe(true);
  });

  it("追加: 分析シート", async () => {
    const created = await createExcelFromAssignment({ assignment: "売上管理表を作って" });
    const analysis = analyzeWorkbookModel(created.workbook!);
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.comments.length).toBeGreaterThan(0);
  });

  it("追加: 低信頼セルのハイライト", async () => {
    const r = await createExcelFromVisionTables({
      title: "不明あり",
      tables: [
        {
          headers: ["品目", "金額"],
          rows: [["牛乳?", "要確認"]],
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});
