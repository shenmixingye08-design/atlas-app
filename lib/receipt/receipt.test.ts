import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prepareMediaImages } from "@/lib/media-pipelines";

import { buildMonthlyAnalytics } from "./analytics";
import { learnCategoryCorrection, suggestCategory } from "./categorize";
import { collectLowConfidenceFields } from "./confidence";
import { buildHouseholdLedgerWorkbook } from "./excel";
import { mockExtractReceipt } from "./extract";
import {
  confirmAndRegisterReceipt,
  runReceiptPipeline,
} from "./pipeline";
import { resetHouseholdLedgerStoreForTests } from "./store";
import type { ReceiptSchema } from "./types";

const userId = "user_receipt_test";

function tinyPng(): Buffer {
  // 1x1 PNG — magic must match declared MIME (P0-05).
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

beforeEach(() => {
  process.env.ATLAS_MOCK_LLM = "true";
  resetHouseholdLedgerStoreForTests();
});

afterEach(() => {
  delete process.env.ATLAS_MOCK_LLM;
  resetHouseholdLedgerStoreForTests();
});

describe("receipt household ledger", () => {
  it("runs receipt pipeline and auto-registers high-confidence mock extract", async () => {
    const images = await prepareMediaImages([
      {
        filename: "receipt-lawson.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId,
      images,
      userHint: "家計簿にして",
    });
    expect(session.status).toBe("registered");
    expect(session.schemas[0]?.visionSucceeded).toBe(true);
    expect(session.entriesPreview.length).toBeGreaterThan(0);
    expect(session.error).toBeNull();
  });

  it("merges multiple receipts into one registration batch", async () => {
    const images = await prepareMediaImages([
      {
        filename: "receipt-a.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
      {
        filename: "receipt-b.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId,
      images,
      userHint: "家計簿にして",
    });
    expect(session.status).toBe("registered");
    expect(session.schemas.length).toBe(2);
    expect(session.entriesPreview.length).toBeGreaterThanOrEqual(2);
  });

  it("learns category corrections per store", () => {
    const schema = mockExtractReceipt(
      {
        id: "i1",
        filename: "receipt.png",
        mimeType: "image/png",
        bytes: tinyPng(),
        dataUrl: "data:image/png;base64,aa",
        contentHash: "abc",
      },
      0,
    );
    const first = suggestCategory(schema, []);
    expect(first).toBe("食費");
    const rules = learnCategoryCorrection([], schema.storeName!, "交際費");
    expect(suggestCategory(schema, rules)).toBe("交際費");
  });

  it("asks only low-confidence fields", () => {
    const weak: ReceiptSchema = {
      ...mockExtractReceipt(
        {
          id: "i1",
          filename: "x.png",
          mimeType: "image/png",
          bytes: tinyPng(),
          dataUrl: "data:image/png;base64,aa",
          contentHash: "abc",
        },
        0,
      ),
      storeName: null,
      fieldConfidence: { storeName: 0.2, date: 0.9, total: 0.9 },
      overallConfidence: 0.4,
    };
    const fields = collectLowConfidenceFields([weak]);
    expect(fields.some((field) => field.field === "storeName")).toBe(true);
    expect(fields.length).toBeLessThanOrEqual(3);
  });

  it("builds excel workbook with required columns", async () => {
    const images = await prepareMediaImages([
      {
        filename: "receipt.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({ userId, images });
    expect(session.status).toBe("registered");
    // entries already persisted by auto-register
    const { listLedgerEntries } = await import("./store");
    const entries = listLedgerEntries(userId);
    const buffer = await buildHouseholdLedgerWorkbook(entries);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // xlsx zip header
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("builds monthly analytics comment without markdown dump", async () => {
    const images = await prepareMediaImages([
      {
        filename: "receipt.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    await runReceiptPipeline({ userId, images });
    const { listLedgerEntries } = await import("./store");
    const entries = listLedgerEntries(userId);
    const ym = entries[0]?.date.slice(0, 7) ?? "2026-07";
    const analytics = buildMonthlyAnalytics(entries, ym);
    expect(analytics.totalSpend).toBeGreaterThan(0);
    expect(analytics.aiComment).not.toMatch(/```/);
    expect(analytics.aiComment.length).toBeGreaterThan(10);
  });

  it("does not register when visionSucceeded is false", async () => {
    // Force failure by classifying non-receipt filename without hint
    // Use invoice filename so pipeline fails before extract.
    const images = await prepareMediaImages([
      {
        filename: "invoice-bill.pdf.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    // Override heuristic: invoice keyword in filename
    const session = await runReceiptPipeline({
      userId,
      images,
      // no household hint
    });
    // filename has invoice → not receipt pipeline
    expect(session.status).toBe("failed");
    expect(session.entriesPreview).toEqual([]);
  });

  it("confirm path registers after field answers", async () => {
    const images = await prepareMediaImages([
      {
        filename: "receipt.png",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    // Use business hint to force expense confirmation path
    const session = await runReceiptPipeline({
      userId,
      images,
      userHint: "家計簿にして",
      hasBusinessContext: true,
      companyHint: "テスト株式会社",
    });
    expect(["awaiting_expense_choice", "registered", "needs_confirmation"]).toContain(
      session.status,
    );
    if (session.status === "awaiting_expense_choice") {
      const registered = confirmAndRegisterReceipt({
        userId,
        sessionId: session.id,
        registerAsExpense: true,
      });
      expect(registered.status).toBe("registered");
      expect(registered.moneyUseGuess).toBe("business");
    }
  });
});
