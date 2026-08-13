/**
 * MINERVOT Excel work-quality golden tests.
 * Scores real generated workbooks (not mocks). Fail below 95/100.
 */
import { describe, expect, it } from "vitest";

import { inspectXlsxAdvancedParts } from "@/lib/deliverables/excel-advanced/chart-ooxml";
import { extractExcelSheets } from "@/lib/deliverables/excel-data";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import {
  classifyDeliverableError,
  wordFailureTitle,
  wordFailureUserMessage,
} from "@/lib/deliverables/recovery-messages";
import { resolveGenerationFormats } from "@/lib/deliverables/resolve-formats";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import type { VisionBatchResult } from "@/lib/vision/types";

import { inferColumnKind, parseNumber, parsePercentage } from "./column-types";
import { resolveExcelIntent } from "./intent";
import { inspectXlsxWorkbook, verifyXlsxWorkbook } from "./verify";

const gen = new XlsxDeliverableGenerator();

const ROSTER = `# 名簿

| 氏名 | 部署 | 電話 |
| --- | --- | --- |
| 山田太郎 | 営業 | 090-1234-5678 |
| 佐藤花子 | 企画 | 080-1111-2222 |
`;

const SALES = `# 売上管理表

| 日付 | 商品 | 数量 | 売上 |
| --- | --- | ---: | ---: |
| 2026-07-01 | りんご | 10 | 3000 |
| 2026-07-15 | みかん | 8 | 1600 |
| 2026-08-02 | りんご | 5 | 1500 |
`;

const LEDGER = `# 家計簿

| 日付 | カテゴリ | 店名 | 金額 |
| --- | --- | --- | ---: |
| 2026-07-01 | 食費 | スーパーA | 1200 |
| 2026-07-02 | 交通 | 駅 | 580 |
| 2026-08-01 | 食費 | スーパーB | 2100 |
`;

const PERCENT = `# 構成比

| 部門 | 割合 |
| --- | ---: |
| 営業 | 45% |
| 開発 | 35% |
| 管理 | 20% |
`;

const WRAP = `# メモ一覧

| 件名 | 詳細 |
| --- | --- |
| 訪問 | 本日の商談では先方の決裁フローと予算上限、導入時期、競合比較の4点を確認し、来週までに見積草案を送付する約束をした。 |
`;

const IMAGE_JSON = JSON.stringify({
  name: "明細",
  columns: [
    { name: "日付", type: "date" },
    { name: "店名", type: "text" },
    { name: "金額", type: "currency" },
  ],
  rows: [
    ["2026-07-01", "コンビニ", "¥1,280"],
    ["2026-07-01", "要確認", "不明"],
  ],
  confidence: [
    [0.95, 0.9, 0.92],
    [0.4, 0.3, 0.2],
  ],
});

function visionBatch(overrides: Partial<VisionBatchResult["images"][0]> = {}): VisionBatchResult {
  return {
    id: "vbatch_excel",
    images: [
      {
        id: "vis_1",
        attachmentId: "img_1",
        detectedType: "screenshot",
        confidence: 0.4,
        summary: "画面の表",
        extractedText: "列A 100\n列B 200",
        language: "ja",
        fields: { appOrSite: "社内ツール" },
        tables: [
          {
            headers: ["項目", "金額"],
            rows: [
              ["交通", 500],
              [null, 800],
            ],
          },
        ],
        visualElements: [],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: ["table_excel"],
        model: "mock",
        detailLevel: "high",
        createdAt: new Date().toISOString(),
        ...overrides,
      },
    ],
    combinedSummary: "表1枚",
    commonFields: { detectedType: "screenshot" },
    differences: [],
    mergedTables: [],
    warnings: [],
    recommendedArtifactType: "table_excel",
    status: "analyzed",
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
  };
}

describe("column types + intent", () => {
  it("does not store yen amounts or phone numbers as calculable text mistakes", () => {
    expect(inferColumnKind("金額", ["¥1,000", "2,500"])).toBe("currency");
    expect(parseNumber("¥1,000")).toBe(1000);
    expect(inferColumnKind("電話", ["09012345678"])).toBe("text");
    expect(inferColumnKind("割合", ["15%", "20%"])).toBe("percentage");
    expect(parsePercentage("15%")).toBeCloseTo(0.15);
  });

  it("does not attach charts or SUM to a roster", () => {
    const intent = resolveExcelIntent({
      assignment: "単純な名簿をExcelにして",
      sheetNames: ["名簿"],
      headers: [["氏名", "部署", "電話"]],
      rowCounts: [2],
    });
    expect(intent.formulas).toBe(false);
    expect(intent.chart).toBe(false);
    expect(intent.kind).toBe("roster");
  });
});

describe("Excel golden 1-20", () => {
  it("1. roster: headers, no SUM, phone stays text", async () => {
    const file = await gen.generate(ROSTER, "名簿", {
      excel: { assignment: "単純な名簿をExcelにして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.ok).toBe(true);
    expect(inspect.sheets[0]?.headers).toEqual(["氏名", "部署", "電話"]);
    expect(inspect.sheets[0]?.formulaTexts.some((f) => f.includes("SUM"))).toBe(
      false,
    );
    expect(inspect.sheets[0]?.textCells).toBeGreaterThan(0);
  });

  it("2. sales table: typed amounts and dates", async () => {
    const file = await gen.generate(SALES, "売上", {
      excel: { assignment: "売上データをExcelにして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.numberCells).toBeGreaterThan(0);
    expect(inspect.sheets[0]?.dateCells).toBeGreaterThan(0);
    expect(inspect.sheets[0]?.currencyFmtCount).toBeGreaterThan(0);
  });

  it("3. monthly sales formulas SUMIFS", async () => {
    const file = await gen.generate(SALES, "売上月次", {
      excel: { assignment: "売上の月次集計をExcelにして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    const formulas = inspect.sheets.flatMap((s) => s.formulaTexts);
    expect(formulas.some((f) => f.includes("SUMIFS") || f.includes("SUM("))).toBe(
      true,
    );
    expect(inspect.sheets.some((s) => s.name.includes("月別"))).toBe(true);
  });

  it("4. household ledger shape", async () => {
    const file = await gen.generate(LEDGER, "家計簿", {
      excel: { assignment: "このレシート一覧を月別家計簿にして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets.length).toBeGreaterThan(1);
    expect(inspect.sheets[0]?.headers).toContain("金額");
    expect(inspect.sheets.some((s) => /月別|ピボット|カテゴリ/.test(s.name))).toBe(
      true,
    );
  });

  it("5. multiple sheets only when meaningful", async () => {
    const roster = await inspectXlsxWorkbook(
      (await gen.generate(ROSTER, "名簿", { excel: { assignment: "名簿" } }))
        .buffer,
    );
    const ledger = await inspectXlsxWorkbook(
      (
        await gen.generate(LEDGER, "家計簿", {
          excel: { assignment: "家計簿にして月別とカテゴリ別も" },
        })
      ).buffer,
    );
    expect(roster.sheets.length).toBe(1);
    expect(ledger.sheets.length).toBeGreaterThan(1);
  });

  it("6. date column typed", async () => {
    const file = await gen.generate(SALES, "日付", {
      excel: { assignment: "売上" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.dateCells).toBeGreaterThan(0);
  });

  it("7. amount column numeric not yen-string", async () => {
    const md = `# 売上

| 項目 | 金額 |
| --- | ---: |
| A | ¥1,000 |
| B | 2,500円 |
`;
    const file = await gen.generate(md, "金額", { excel: { assignment: "売上" } });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.numberCells).toBeGreaterThan(0);
    expect(inspect.sheets[0]?.currencyFmtCount).toBeGreaterThan(0);
  });

  it("8. percentage column", async () => {
    const file = await gen.generate(PERCENT, "割合");
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.percentFmtCount).toBeGreaterThan(0);
  });

  it("9. long text wraps", async () => {
    const file = await gen.generate(WRAP, "長文");
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.wrapCount).toBeGreaterThan(0);
  });

  it("10. Japanese headers survive reopen", async () => {
    const file = await gen.generate(ROSTER, "日本語");
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.headers.join("")).toMatch(/氏名|部署/);
    expect(inspect.verify.ok).toBe(true);
  });

  it("11. empty table still opens with headers", async () => {
    const md = `# 空

| 名前 | 部署 |
| --- | --- |
`;
    const file = await gen.generate(md, "空");
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.ok).toBe(true);
    expect(inspect.sheets[0]?.headers).toEqual(["名前", "部署"]);
  });

  it("12. 1000 rows reopen", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => `| 行${i + 1} | ${i} |`);
    const md = `# 大量\n\n| 項目 | 値 |\n| --- | ---: |\n${rows.join("\n")}\n`;
    const file = await gen.generate(md, "大量");
    const verify = await verifyXlsxWorkbook(file.buffer);
    expect(verify.ok).toBe(true);
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.sheets[0]?.rowCount).toBeGreaterThan(1000);
  });

  it("13. image-derived structured rows + 要確認", async () => {
    const sheets = extractExcelSheets(IMAGE_JSON);
    expect(sheets[0]?.rows[1]?.some((c) => c === "要確認")).toBe(true);
    const file = await gen.generate(IMAGE_JSON, "画像表", {
      excel: { assignment: "この画像の表をExcelにして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.ok).toBe(true);
    const seed = visionBatchToDeliverableContent(visionBatch());
    expect(seed).toContain("|");
    expect(seed).toContain("要確認");
    expect(seed.includes("列A 100\n列B 200") && !seed.includes("|")).toBe(false);
  });

  it("14. missing values stay blank / 要確認, not invented numbers", async () => {
    const md = `# 欠損

| 日付 | 金額 |
| --- | ---: |
| 2026-07-01 | 1000 |
| 要確認 | 要確認 |
`;
    const file = await gen.generate(md, "欠損", { excel: { assignment: "売上" } });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.ok).toBe(true);
    expect(inspect.sheets[0]?.textCells).toBeGreaterThan(0);
  });

  it("15. formula references detail sheet", async () => {
    const file = await gen.generate(LEDGER, "数式", {
      excel: { assignment: "家計簿を月別集計して" },
    });
    const formulas = (await inspectXlsxWorkbook(file.buffer)).sheets.flatMap(
      (s) => s.formulaTexts,
    );
    expect(formulas.some((f) => /SUMIFS|SUMIF|SUM\(/.test(f))).toBe(true);
    expect(formulas.every((f) => !/#REF!/i.test(f))).toBe(true);
  });

  it("16-17. filter and freeze pane", async () => {
    const file = await gen.generate(SALES, "layout", {
      excel: { assignment: "売上" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.hasFilter).toBe(true);
    expect(inspect.verify.hasFreeze).toBe(true);
    expect(inspect.sheets[0]?.hasFilter).toBe(true);
    expect(inspect.sheets[0]?.hasFreeze).toBe(true);
  });

  it("18. chart only when aggregatable sales, not roster", async () => {
    const sales = await gen.generate(SALES, "chart-sales", {
      excel: { assignment: "売上をグラフ付きで" },
    });
    const roster = await gen.generate(ROSTER, "chart-roster", {
      excel: { assignment: "名簿" },
    });
    const salesParts = await inspectXlsxAdvancedParts(sales.buffer);
    const rosterParts = await inspectXlsxAdvancedParts(roster.buffer);
    expect(salesParts.hasChart).toBe(true);
    expect(rosterParts.hasChart).toBe(false);
  });

  it("19. save then reopen is the success gate", async () => {
    const file = await gen.generate(LEDGER, "reopen", {
      excel: { assignment: "家計簿" },
    });
    const verify = await verifyGeneratedExportAsync(file);
    expect(verify.ok).toBe(true);
    const again = await verifyXlsxWorkbook(file.buffer);
    expect(again.ok).toBe(true);
    expect(again.sheetCount).toBeGreaterThan(0);
  });

  it("20. Home / workspace share the same xlsx generator SoT", () => {
    const home = resolveGenerationFormats("この表をExcelにして");
    const workspace = resolveGenerationFormats("売上データをExcelにして");
    expect(home.formats).toContain("xlsx");
    expect(workspace.formats).toContain("xlsx");
    expect(getDeliverableGenerator("xlsx")).toBeInstanceOf(XlsxDeliverableGenerator);
    expect(getDeliverableGenerator("xlsx")).toBe(getDeliverableGenerator("xlsx"));
  });
});

describe("Excel quality score (real workbooks)", () => {
  it("scores at least 95/100 from generated fixtures", async () => {
    const points = {
      structure: 0,
      practical: 0,
      types: 0,
      formulas: 0,
      layout: 0,
      sheets: 0,
      chart: 0,
      image: 0,
      durability: 0,
      ux: 0,
    };

    const roster = await inspectXlsxWorkbook(
      (await gen.generate(ROSTER, "s1", { excel: { assignment: "名簿" } })).buffer,
    );
    const sales = await inspectXlsxWorkbook(
      (
        await gen.generate(SALES, "s2", {
          excel: { assignment: "売上の月次集計をExcelにして" },
        })
      ).buffer,
    );
    const ledger = await inspectXlsxWorkbook(
      (
        await gen.generate(LEDGER, "s3", {
          excel: { assignment: "レシート一覧を月別家計簿にして" },
        })
      ).buffer,
    );
    const percent = await inspectXlsxWorkbook(
      (await gen.generate(PERCENT, "s4")).buffer,
    );
    const yen = await inspectXlsxWorkbook(
      (
        await gen.generate(
          `# 売上\n\n| 項目 | 金額 |\n| --- | ---: |\n| A | ¥1,000 |\n`,
          "s5",
          { excel: { assignment: "売上" } },
        )
      ).buffer,
    );
    const wrap = await inspectXlsxWorkbook((await gen.generate(WRAP, "s6")).buffer);
    const imageFile = await gen.generate(IMAGE_JSON, "s7", {
      excel: { assignment: "画像の表をExcelに" },
    });
    const image = await inspectXlsxWorkbook(imageFile.buffer);
    const salesParts = await inspectXlsxAdvancedParts(
      (
        await gen.generate(SALES, "s8", {
          excel: { assignment: "売上をグラフ付きで" },
        })
      ).buffer,
    );
    const rosterParts = await inspectXlsxAdvancedParts(
      (await gen.generate(ROSTER, "s9", { excel: { assignment: "名簿" } })).buffer,
    );

    if (
      roster.sheets[0]?.headers.includes("氏名") &&
      !roster.sheets[0].headers.includes("") &&
      sales.sheets[0]?.headers.includes("売上")
    ) {
      points.structure = 15;
    } else {
      points.structure = 8;
    }

    if (
      roster.verify.hasFilter &&
      roster.verify.hasFreeze &&
      sales.verify.hasFilter &&
      ledger.sheets.length > 1
    ) {
      points.practical = 20;
    } else {
      points.practical = 12;
    }

    if (
      sales.sheets[0] &&
      sales.sheets[0].dateCells > 0 &&
      yen.sheets[0] &&
      yen.sheets[0].numberCells > 0 &&
      percent.sheets[0] &&
      percent.sheets[0].percentFmtCount > 0
    ) {
      points.types = 10;
    } else {
      points.types = 6;
    }

    const salesFormulas = sales.sheets.flatMap((s) => s.formulaTexts);
    const rosterFormulas = roster.sheets.flatMap((s) => s.formulaTexts);
    if (
      salesFormulas.some((f) => /SUMIFS|SUMIF|SUM\(/.test(f)) &&
      rosterFormulas.every((f) => !/SUM\(/.test(f))
    ) {
      points.formulas = 10;
    } else {
      points.formulas = 5;
    }

    if (
      wrap.sheets[0]?.wrapCount &&
      wrap.sheets[0].wrapCount > 0 &&
      sales.sheets[0]?.hasFreeze &&
      sales.sheets[0].mergeCount === 0
    ) {
      points.layout = 15;
    } else {
      points.layout = 9;
    }

    if (roster.sheets.length === 1 && ledger.sheets.length >= 2) {
      points.sheets = 5;
    } else {
      points.sheets = 2;
    }

    if (salesParts.hasChart && !rosterParts.hasChart) {
      points.chart = 5;
    } else {
      points.chart = 2;
    }

    const imageSheets = extractExcelSheets(IMAGE_JSON);
    const visionMd = visionBatchToDeliverableContent(visionBatch());
    if (
      image.verify.ok &&
      imageSheets[0]?.rows[1]?.includes("要確認") &&
      visionMd.includes("|") &&
      visionMd.includes("要確認")
    ) {
      points.image = 5;
    } else {
      points.image = 2;
    }

    const corrupt = await verifyXlsxWorkbook(Buffer.from("PK not-xlsx"));
    const good = await verifyGeneratedExportAsync(
      await gen.generate(SALES, "dur", { excel: { assignment: "売上" } }),
    );
    if (!corrupt.ok && good.ok && image.verify.ok && ledger.verify.ok) {
      points.durability = 10;
    } else {
      points.durability = 5;
    }

    const kinds = [
      classifyDeliverableError("excel_structure:empty_sheet"),
      classifyDeliverableError("excel_workbook:exceljs"),
      classifyDeliverableError("excel_corrupt:xlsx_reopen_failed"),
      classifyDeliverableError("excel_unsupported:excel_advanced_no_aggregatable_columns"),
      classifyDeliverableError("storage_failed:bucket"),
    ];
    const titles = kinds.map((k) => wordFailureTitle(k));
    const messages = kinds.map((k) => wordFailureUserMessage(k));
    if (
      kinds[0] === "excel_structure" &&
      kinds[1] === "excel_workbook" &&
      kinds[2] === "excel_corrupt" &&
      kinds[3] === "excel_unsupported" &&
      kinds[4] === "persist" &&
      titles.every((t) => t && !t.includes("Excel生成に失敗しました")) &&
      messages.every((m) => m.length > 10) &&
      classifyDeliverableError("Word生成失敗: Packer") === "word_convert"
    ) {
      points.ux = 5;
    } else {
      points.ux = 2;
    }

    const total = Object.values(points).reduce((a, b) => a + b, 0);
    expect({ total, points }).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        points: expect.any(Object),
      }),
    );
    expect(total).toBeGreaterThanOrEqual(95);
  });
});
