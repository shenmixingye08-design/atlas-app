import { describe, expect, it } from "vitest";

import { parseImageAnalysisJson } from "./schemas";
import { applyAmountValidation } from "./amounts";
import type { ReceiptImageAnalysis } from "./types";
import { AMOUNT_MISMATCH_WARNING } from "./types";

describe("parseImageAnalysisJson", () => {
  it("accepts a valid receipt payload", () => {
    const result = parseImageAnalysisJson({
      documentType: "receipt",
      title: "サンプル商店",
      confidence: 0.9,
      requiresReview: false,
      sourceFileId: "a1",
      sourceFiles: [],
      createdAt: "2026-07-22T00:00:00.000Z",
      warnings: [],
      fields: {
        purchaseDate: "2026-07-22",
        purchaseTime: "12:00",
        storeName: "サンプル商店",
        storeAddress: null,
        taxAmount: 80,
        totalAmount: 1080,
        paymentMethod: "現金",
      },
      rows: [
        {
          name: "お茶",
          quantity: 1,
          unitPrice: 1000,
          subtotal: 1000,
          discount: 0,
          taxRate: 0.08,
          category: "食費",
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing title", () => {
    const result = parseImageAnalysisJson({
      documentType: "table",
      confidence: 0.5,
      requiresReview: true,
      sourceFileId: null,
      sourceFiles: [],
      createdAt: "2026-07-22T00:00:00.000Z",
      warnings: [],
      fields: { columns: ["A"] },
      rows: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("applyAmountValidation", () => {
  it("warns when receipt totals mismatch", () => {
    const analysis: ReceiptImageAnalysis = {
      documentType: "receipt",
      title: "不一致レシート",
      confidence: 0.8,
      requiresReview: false,
      sourceFileId: "x",
      sourceFiles: [],
      createdAt: "2026-07-22T00:00:00.000Z",
      warnings: [],
      fields: {
        purchaseDate: "2026-07-22",
        purchaseTime: null,
        storeName: "店",
        storeAddress: null,
        taxAmount: 0,
        totalAmount: 9999,
        paymentMethod: null,
      },
      rows: [
        {
          name: "商品",
          quantity: 1,
          unitPrice: 100,
          subtotal: 100,
          discount: 0,
          taxRate: null,
          category: "その他",
        },
      ],
    };

    const next = applyAmountValidation(analysis);
    expect(next.warnings).toContain(AMOUNT_MISMATCH_WARNING);
    expect(next.requiresReview).toBe(true);
    if (next.documentType === "receipt") {
      expect(next.fields.totalAmount).toBe(9999);
    }
  });
});
