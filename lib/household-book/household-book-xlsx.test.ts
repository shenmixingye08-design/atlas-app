import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));

import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { inspectXlsxWorkbook } from "@/lib/deliverables/excel-workbook/verify";
import { mergeVisionBatch } from "@/lib/vision/merge-batch";
import type { VisionAnalysisResult, VisionBatchResult } from "@/lib/vision/types";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { estimateVisionFixtureCost } from "@/lib/vision/vision-cost-estimate";
import { generateDeliverables } from "@/lib/deliverables/engine";

function image(partial: Partial<VisionAnalysisResult> & Pick<VisionAnalysisResult, "detectedType">): VisionAnalysisResult {
  return {
    id: partial.id ?? "vis_1",
    attachmentId: partial.attachmentId ?? "att_1",
    detectedType: partial.detectedType,
    confidence: 0.92,
    summary: "レシート",
    extractedText: "TEST MART お茶 150 弁当 980 合計 1280",
    language: "ja",
    fields: partial.fields ?? {},
    tables: [],
    visualElements: [],
    layout: null,
    styleSignals: null,
    warnings: [],
    missingFields: [],
    recommendedActions: [],
    artifactSuggestions: ["household_excel"],
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
  };
}

function batch(images: VisionAnalysisResult[]): VisionBatchResult {
  const merged = mergeVisionBatch(images);
  return {
    id: "vbatch_xlsx",
    images,
    combinedSummary: "レシート",
    commonFields: { ...merged.commonFields, detectedType: "receipt" },
    differences: [],
    mergedTables: [],
    warnings: merged.warnings,
    recommendedArtifactType: "household_excel",
    status: "analyzed",
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
  };
}

async function readSheet(buffer: Buffer, name: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(name);
  expect(sheet, `missing sheet ${name}`).toBeTruthy();
  return sheet!;
}

describe("household book xlsx reopen", () => {
  it("writes typed dates / numbers and category totals", async () => {
    const seed = visionBatchToDeliverableContent(
      batch([
        image({
          detectedType: "receipt",
          fields: {
            storeName: "TEST MART",
            date: "2026-07-25",
            items: [
              { name: "お茶", quantity: 1, unitPrice: 150, amount: 150 },
              { name: "弁当", quantity: 1, unitPrice: 980, amount: 980 },
            ],
            subtotal: 1130,
            tax: 150,
            total: 1280,
            paymentMethod: "現金",
          },
        }),
      ]),
      "このレシートを家計簿にして",
    );

    const file = await new XlsxDeliverableGenerator().generate(seed, "家計簿", {
      excel: { assignment: "このレシートを家計簿にして" },
    });
    const inspect = await inspectXlsxWorkbook(file.buffer);
    expect(inspect.verify.ok).toBe(true);
    expect(inspect.sheets.some((sheet) => sheet.name === "明細")).toBe(true);
    expect(inspect.sheets.some((sheet) => sheet.name === "集計")).toBe(true);

    const detail = await readSheet(file.buffer, "明細");
    const headers = (detail.getRow(1).values as Array<string | null>).slice(1);
    expect(headers).toEqual([
      "日付",
      "店舗",
      "カテゴリ",
      "商品名",
      "数量",
      "単価",
      "金額",
      "支払方法",
      "メモ",
    ]);

    const row2 = detail.getRow(2);
    expect(row2.getCell(1).value).toBeInstanceOf(Date);
    expect((row2.getCell(1).value as Date).toISOString().startsWith("2026-07-25")).toBe(true);
    expect(row2.getCell(2).value).toBe("TEST MART");
    expect(row2.getCell(4).value).toBe("お茶");
    expect(row2.getCell(5).value).toBe(1);
    expect(typeof row2.getCell(5).value).toBe("number");
    expect(row2.getCell(6).value).toBe(150);
    expect(typeof row2.getCell(6).value).toBe("number");
    expect(row2.getCell(7).value).toBe(150);
    expect(typeof row2.getCell(7).value).toBe("number");
    expect(String(row2.getCell(7).value)).not.toContain("円");

    const row3 = detail.getRow(3);
    expect(row3.getCell(4).value).toBe("弁当");
    expect(row3.getCell(7).value).toBe(980);

    const summary = await readSheet(file.buffer, "集計");
    const summaryRows: Array<{ kind: string; item: string; amount: unknown; count: unknown }> = [];
    summary.eachRow((row, index) => {
      if (index === 1) return;
      summaryRows.push({
        kind: String(row.getCell(1).value ?? ""),
        item: String(row.getCell(2).value ?? ""),
        amount: row.getCell(3).value,
        count: row.getCell(4).value,
      });
    });
    const total = summaryRows.find((row) => row.kind === "総支出");
    expect(total?.amount).toBe(1280);
    expect(typeof total?.amount).toBe("number");
    const count = summaryRows.find((row) => row.kind === "レシート件数");
    expect(count?.count).toBe(1);
    const food = summaryRows.find((row) => row.kind === "カテゴリ別" && row.item === "食費");
    expect(food?.amount).toBe(1130);
    const store = summaryRows.find((row) => row.kind === "店舗別" && row.item === "TEST MART");
    expect(store?.amount).toBe(1280);
    const day = summaryRows.find((row) => row.kind === "日別" && row.item === "2026-07-25");
    expect(day?.amount).toBe(1280);

    const generated = await generateDeliverables(
      {
        assignment: "このレシートを家計簿Excelにしてください",
        finalDeliverable: seed,
        title: "家計簿（レシート）",
        formats: ["xlsx"],
      },
      "https://atlasapp.jp",
      {
        userId: "user_household_xlsx",
        jobId: "job_household_xlsx",
        suppressWordReadyNotification: true,
        contentAlreadyApproved: true,
      },
    );
    expect(generated.failures, JSON.stringify(generated.failures)).toEqual([]);
    expect(generated.deliverables.some((row) => row.format === "xlsx")).toBe(true);
  });

  it("estimates 1 Vision AI call per receipt image (no classify/excel/summary AI)", () => {
    const one = estimateVisionFixtureCost({
      name: "household-1",
      detail: "high",
      imageCount: 1,
    });
    expect(one.aiCalls).toBe(1);
    const ten = estimateVisionFixtureCost({
      name: "household-10",
      detail: "high",
      imageCount: 10,
    });
    expect(ten.aiCalls).toBe(10);
    expect(ten.estimatedUsd).toBeGreaterThan(one.estimatedUsd);
  });
});
