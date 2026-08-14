import { describe, expect, it } from "vitest";

import { mergeVisionBatch } from "@/lib/vision/merge-batch";
import type { VisionAnalysisResult, VisionBatchResult } from "@/lib/vision/types";
import { classifyImagePurposeFromText, inferVisionUserIntent } from "@/lib/vision/classify";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { formatsFromVisionBatch } from "@/lib/vision/formats-from-vision";
import { evaluateVisionBatchGate } from "@/lib/vision/gate";
import { extractExcelSheets } from "@/lib/deliverables/excel-data";
import { validateDeliverableSourceContent } from "@/lib/deliverables/content-quality";

import { classifyHouseholdCategory } from "./categories";
import {
  householdBookFromVision,
  parseHouseholdDate,
  parseHouseholdNumber,
  shouldBuildHouseholdBook,
} from "./from-vision";
import {
  isHouseholdBookRequest,
  isHouseholdAppendRequest,
  isTableSpreadsheetRequest,
} from "./intent";
import { mergeHouseholdDocuments, persistableHouseholdLines, toLedgerEntries } from "./append";
import { preferencesFromMemoryValues, buildHouseholdMemoryCandidateInputs } from "./memory";
import { householdBookToExcelSeed } from "./seed";

function image(partial: Partial<VisionAnalysisResult> & Pick<VisionAnalysisResult, "detectedType">): VisionAnalysisResult {
  return {
    id: partial.id ?? "vis_1",
    attachmentId: partial.attachmentId ?? "att_1",
    detectedType: partial.detectedType,
    confidence: partial.confidence ?? 0.9,
    summary: partial.summary ?? "レシート",
    extractedText: partial.extractedText ?? "TEST MART 合計 1280",
    language: "ja",
    fields: partial.fields ?? {},
    tables: partial.tables ?? [],
    visualElements: [],
    layout: null,
    styleSignals: null,
    warnings: partial.warnings ?? [],
    missingFields: partial.missingFields ?? [],
    recommendedActions: [],
    artifactSuggestions: ["household_excel"],
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
    pageIndex: partial.pageIndex,
  };
}

function batch(
  images: VisionAnalysisResult[],
  recommended = "household_excel",
): VisionBatchResult {
  const merged = mergeVisionBatch(images);
  return {
    id: "vbatch_hb",
    images,
    combinedSummary: images.map((row, i) => `【画像${i + 1}】${row.summary}`).join("\n"),
    commonFields: { ...merged.commonFields, detectedType: images[0]?.detectedType },
    differences: [],
    mergedTables: merged.mergedTables,
    warnings: merged.warnings,
    recommendedArtifactType: recommended,
    status: "analyzed",
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
  };
}

const SINGLE_RECEIPT = image({
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
});

describe("household intent routing", () => {
  it("routes household natural language to receipt / spreadsheet", () => {
    const phrases = [
      "このレシート家計簿にして",
      "レシートをExcelにして",
      "今月の支出に追加して",
      "この買い物まとめて",
      "家計簿作って",
      "今日のレシート整理して",
    ];
    for (const phrase of phrases) {
      expect(isHouseholdBookRequest(phrase, "receipt")).toBe(true);
      expect(inferVisionUserIntent(phrase)).toBe("spreadsheet");
    }
    expect(classifyImagePurposeFromText("今月の支出に追加して")).toBe("receipt");
    expect(classifyImagePurposeFromText("この買い物まとめて")).toBe("receipt");
    expect(isHouseholdAppendRequest("このレシートも家計簿に追加して")).toBe(true);
  });

  it("does not treat a table photo Excel request as household", () => {
    expect(isTableSpreadsheetRequest("この表をExcelにして")).toBe(true);
    expect(isHouseholdBookRequest("この表をExcelにして", "table")).toBe(false);
    expect(isHouseholdBookRequest("表をエクセルにして", "spreadsheet_source")).toBe(false);
    expect(classifyImagePurposeFromText("この表をExcelにして")).toBe("table");
    const tableBatch = batch(
      [
        image({
          detectedType: "table",
          fields: {},
          tables: [{ headers: ["A", "B"], rows: [["1", "2"]] }],
          artifactSuggestions: ["table_excel"],
        }),
      ],
      "table_excel",
    );
    expect(shouldBuildHouseholdBook(tableBatch, "この表をExcelにして")).toBe(false);
    const seed = visionBatchToDeliverableContent(tableBatch, "この表をExcelにして");
    expect(seed).toContain("表データ");
    expect(seed).not.toContain("## 明細");
    expect(formatsFromVisionBatch(tableBatch, "この表をExcelにして")).toEqual(["xlsx"]);
  });
});

describe("household number / date parsing", () => {
  it("parses numeric money and refuses guesses", () => {
    expect(parseHouseholdNumber(1280)).toBe(1280);
    expect(parseHouseholdNumber("1,280円")).toBe(1280);
    expect(parseHouseholdNumber("約1280")).toBeNull();
    expect(parseHouseholdNumber("")).toBeNull();
    expect(parseHouseholdNumber(null)).toBeNull();
    expect(parseHouseholdDate("2026/07/25")).toBe("2026-07-25");
    expect(parseHouseholdDate("不明")).toBeNull();
  });
});

describe("category classification without extra AI", () => {
  it("classifies from item / store keywords and stays その他 when unsure", () => {
    expect(
      classifyHouseholdCategory({ storeName: "テスト薬局", itemName: "風邪薬" }).category,
    ).toBe("医療費");
    expect(
      classifyHouseholdCategory({ storeName: "TEST MART", itemName: "お茶" }).category,
    ).toBe("食費");
    expect(
      classifyHouseholdCategory({ storeName: "謎の店", itemName: "不明商品" }).category,
    ).toBe("その他");
    expect(
      classifyHouseholdCategory({ storeName: "謎の店", itemName: "不明商品" }).confident,
    ).toBe(false);
  });

  it("uses Memory store→category when provided", () => {
    const prefs = preferencesFromMemoryValues([
      {
        scope: "recurring_work_preferences",
        key: "household_store_category:セブンイレブン",
        value: { storeKey: "セブンイレブン", category: "食費" },
      },
    ]);
    expect(
      classifyHouseholdCategory({
        storeName: "セブンイレブン",
        itemName: "チャージ",
        preferences: prefs,
      }).reason,
    ).toBe("memory");
  });
});

describe("single and multi receipt structuring", () => {
  it("turns one receipt into multiple household lines", () => {
    const book = householdBookFromVision(batch([SINGLE_RECEIPT]), {
      assignment: "このレシートを家計簿にして",
    });
    expect(book.receiptCount).toBe(1);
    expect(book.lines).toHaveLength(2);
    expect(book.lines.map((line) => line.itemName)).toEqual(["お茶", "弁当"]);
    expect(book.lines[0]?.amount).toBe(150);
    expect(book.totalSpend).toBe(1280);
    expect(book.appendable).toBe(true);
  });

  it("keeps separate receipts as separate transactions", () => {
    const a = image({
      detectedType: "receipt",
      attachmentId: "att_a",
      fields: {
        storeName: "店A",
        date: "2026-07-01",
        items: [{ name: "パン", amount: 200 }],
        total: 200,
      },
    });
    const b = image({
      detectedType: "receipt",
      attachmentId: "att_b",
      id: "vis_2",
      fields: {
        storeName: "店B",
        date: "2026-07-02",
        items: [{ name: "洗剤", amount: 300 }],
        total: 300,
      },
    });
    const book = householdBookFromVision(batch([a, b]), {
      assignment: "この買い物まとめて",
    });
    expect(book.receiptCount).toBe(2);
    expect(book.lines.map((line) => line.storeName)).toEqual(["店A", "店B"]);
    expect(book.lines.map((line) => line.itemName)).toEqual(["パン", "洗剤"]);
    expect(book.totalSpend).toBe(500);
  });

  it("does not double-count the same receipt front and back", () => {
    const front = image({
      detectedType: "receipt",
      attachmentId: "att_front",
      fields: {
        storeName: "TEST MART",
        date: "2026-07-25",
        items: [{ name: "お茶", amount: 150 }],
        total: 1280,
        paymentMethod: "現金",
      },
    });
    const back = image({
      detectedType: "receipt",
      id: "vis_back",
      attachmentId: "att_back",
      fields: {
        storeName: "TEST MART",
        date: "2026-07-25",
        items: [],
        total: 1280,
        paymentMethod: "クレジット",
      },
    });
    const book = householdBookFromVision(batch([front, back]), {
      assignment: "家計簿にして",
    });
    expect(book.receiptCount).toBe(1);
    expect(book.totalSpend).toBe(1280);
    expect(book.warnings.some((row) => row.code === "double_count_prevented")).toBe(true);
  });

  it("does not invent an unreadable amount", () => {
    const unread = image({
      detectedType: "receipt",
      fields: {
        storeName: "TEST MART",
        date: "2026-07-25",
        items: [{ name: "お茶", amount: null }],
        total: null,
      },
      missingFields: ["total"],
    });
    const book = householdBookFromVision(batch([unread]), {
      assignment: "家計簿にして",
    });
    expect(book.lines[0]?.amount).toBeNull();
    expect(book.totalSpend).toBeNull();
    expect(book.appendable).toBe(false);
    expect(book.userMessages.some((message) => message.includes("合計金額を読み取れませんでした"))).toBe(
      true,
    );
    expect(persistableHouseholdLines(book)).toEqual([]);
  });
});

describe("household excel seed", () => {
  it("emits 明細 + 集計 without yen-text amounts", () => {
    const book = householdBookFromVision(batch([SINGLE_RECEIPT]), {
      assignment: "家計簿にして",
    });
    const seed = householdBookToExcelSeed(book);
    expect(seed).toContain("# 家計簿");
    expect(seed).toContain("## 明細");
    expect(seed).toContain("## 集計");
    expect(seed).not.toMatch(/1,280円/);
    const sheets = extractExcelSheets(seed);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["明細", "集計"]);
    expect(sheets[0]?.headers).toEqual([
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
    expect(sheets[0]?.rows).toHaveLength(2);
    expect(sheets[0]?.rows[0]?.[6]).toBe("150");
    expect(sheets[1]?.rows.some((row) => row[0] === "総支出" && row[2] === "1280")).toBe(true);
    expect(sheets[1]?.rows.some((row) => row[0] === "レシート件数" && row[3] === "1")).toBe(true);
    expect(sheets[1]?.rows.some((row) => row[0] === "カテゴリ別" && row[1] === "食費")).toBe(true);
    const quality = validateDeliverableSourceContent(seed, ["xlsx"]);
    expect(quality.ok, JSON.stringify(quality)).toBe(true);
  });
});

describe("append + memory candidates", () => {
  it("merges additional receipts without mixing lines", () => {
    const first = householdBookFromVision(batch([SINGLE_RECEIPT]), {
      assignment: "家計簿にして",
    });
    const extra = householdBookFromVision(
      batch([
        image({
          detectedType: "receipt",
          attachmentId: "att_2",
          fields: {
            storeName: "店C",
            date: "2026-07-26",
            items: [{ name: "切符", amount: 180 }],
            total: 180,
          },
        }),
      ]),
      { assignment: "このレシートも家計簿に追加して" },
    );
    const merged = mergeHouseholdDocuments(first, extra);
    expect(merged.receiptCount).toBe(2);
    expect(merged.lines).toHaveLength(3);
    const entries = toLedgerEntries("user_a", merged);
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((row) => row.receiptId)).size).toBe(2);
  });

  it("proposes Memory candidates and never auto-activates", () => {
    const book = householdBookFromVision(batch([SINGLE_RECEIPT]), {
      assignment: "家計簿にして",
    });
    const candidates = buildHouseholdMemoryCandidateInputs(book);
    expect(candidates.every((row) => row.status === "candidate")).toBe(true);
    expect(candidates.every((row) => row.source === "system_inference")).toBe(true);
  });
});

describe("household gate messages", () => {
  it("tells the user when the image is not a receipt", () => {
    const table = batch(
      [
        image({
          detectedType: "table",
          fields: {},
          tables: [{ headers: ["列"], rows: [["値"]] }],
        }),
      ],
      "table_excel",
    );
    const gate = evaluateVisionBatchGate({
      batch: table,
      userText: "家計簿にして",
    });
    expect(gate.status).toBe("needs_input");
    expect(gate.message).toContain("レシートではないため、家計簿にできませんでした");
  });
});
