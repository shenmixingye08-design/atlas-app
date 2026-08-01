import { describe, expect, it } from "vitest";

import {
  estimateOcrAccuracy,
  extractStructuredOcrFields,
  mergeStructuredFields,
} from "@/lib/vision/vision-production/ocr-fields";

describe("vision production ocr-fields", () => {
  it("extracts JP amounts, tax, contact, and company", () => {
    const text = [
      "株式会社サンプル",
      "東京都千代田区1-1-1",
      "TEL 03-1234-5678",
      "mail info@example.com",
      "2026/07/25",
      "税抜 1,000",
      "消費税 100",
      "税込合計 1,100円",
      "数量 2",
      "単価 500",
    ].join("\n");

    const structured = extractStructuredOcrFields(text, {});
    expect(structured.companyName).toContain("株式会社");
    expect(structured.address).toContain("東京都");
    expect(structured.phone).toMatch(/03/);
    expect(structured.email).toBe("info@example.com");
    expect(structured.date).toContain("2026");
    expect(structured.amountTaxExcluded).toBe(1000);
    expect(structured.taxAmount).toBe(100);
    expect(structured.amountTaxIncluded).toBe(1100);
    expect(structured.total).toBe(1100);
    expect(structured.quantity).toBe(2);
    expect(structured.unitPrice).toBe(500);
    expect(structured.currency).toBe("JPY");
  });

  it("merges without overwriting existing fields", () => {
    const merged = mergeStructuredFields(
      { total: 999, companyName: "既存" },
      {
        companyName: "新規",
        address: "大阪府大阪市",
        phone: null,
        email: null,
        date: null,
        amountTaxIncluded: 100,
        amountTaxExcluded: null,
        taxAmount: null,
        quantity: null,
        unitPrice: null,
        total: 100,
        currency: "JPY",
      },
    );
    expect(merged.total).toBe(999);
    expect(merged.companyName).toBe("既存");
    expect(merged.address).toBe("大阪府大阪市");
    expect(merged.currency).toBe("JPY");
  });

  it("scores OCR accuracy from coverage", () => {
    const score = estimateOcrAccuracy(
      "請求書 合計 1000",
      { date: "2026-01-01", total: 1000, companyName: "A" },
      ["date", "total", "companyName"],
    );
    expect(score).toBeGreaterThan(0.65);
  });
});
