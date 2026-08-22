import { describe, expect, it } from "vitest";

import { classifyImagePurposeFromText, recommendDetailLevel } from "@/lib/vision/classify";
import { parseVisionModelPayload } from "@/lib/vision/parse-model-json";
import { buildVisionEnrichedAssignment } from "@/lib/vision/adapters/to-assignment-context";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { VisionError, type VisionBatchResult } from "@/lib/vision/types";
import { assertSupportedImage, ImageValidationError } from "@/lib/attachments/image-security";
import { hashImageBytes } from "@/lib/attachments/image-hash";

describe("vision classify", () => {
  it("detects receipt / table / sales intents from text", () => {
    expect(classifyImagePurposeFromText("このレシートを家計簿にして")).toBe("receipt");
    expect(classifyImagePurposeFromText("この表をExcelにして")).toBe("table");
    expect(classifyImagePurposeFromText("この営業資料を改善して")).toBe("sales_material");
    expect(classifyImagePurposeFromText("手書きメモを文字にして")).toBe("handwritten_note");
    expect(
      classifyImagePurposeFromText("この契約書を要約してWordにしてください"),
    ).toBe("contract");
    expect(
      classifyImagePurposeFromText(
        "このグラフを分析してレポートをWordで作成してください",
      ),
    ).toBe("chart");
  });

  it("recommends high detail for receipts and low for many eco photos", () => {
    expect(
      recommendDetailLevel({
        detectedType: "receipt",
        userText: "家計簿にして",
        imageCount: 1,
      }),
    ).toBe("high");
    expect(
      recommendDetailLevel({
        detectedType: "general_photo",
        userText: "見て",
        imageCount: 6,
        ecoMode: true,
      }),
    ).toBe("low");
  });
});

describe("vision json parse", () => {
  it("parses model JSON payload", () => {
    const payload = parseVisionModelPayload(
      JSON.stringify({
        detectedType: "receipt",
        confidence: 0.9,
        summary: "ok",
        fields: { total: 100 },
        tables: [],
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: ["household_excel"],
      }),
    );
    expect(payload.detectedType).toBe("receipt");
    expect(payload.fields.total).toBe(100);
  });

  it("does not throw raw JSON to callers on failure", () => {
    expect(() => parseVisionModelPayload("not-json {{{")).toThrow(VisionError);
    try {
      parseVisionModelPayload("not-json {{{");
    } catch (error) {
      expect(error).toBeInstanceOf(VisionError);
      expect((error as VisionError).message).not.toContain("{");
    }
  });
});

describe("vision adapters", () => {
  const batch: VisionBatchResult = {
    id: "vbatch_test",
    images: [
      {
        id: "vis_1",
        attachmentId: "img_1",
        detectedType: "receipt",
        confidence: 0.9,
        summary: "コンビニレシート",
        extractedText: "合計 1280",
        language: "ja",
        fields: {
          storeName: "TEST MART",
          date: "2026-07-25",
          items: [{ name: "お茶", amount: 150, category: "飲料" }],
          total: 1280,
          paymentMethod: "現金",
        },
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
      },
    ],
    combinedSummary: "レシート1枚",
    commonFields: { detectedType: "receipt" },
    differences: [],
    mergedTables: [],
    warnings: [],
    recommendedArtifactType: "household_excel",
    status: "analyzed",
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
  };

  it("enriches assignment with vision context", () => {
    const text = buildVisionEnrichedAssignment({
      assignment: "家計簿Excelにして",
      batch,
    });
    expect(text).toContain("家計簿Excelにして");
    expect(text).toContain("VisionAnalysis");
    expect(text).toContain("TEST MART");
  });

  it("builds household markdown table for excel path", () => {
    const md = visionBatchToDeliverableContent(batch);
    expect(md).toContain("家計簿");
    expect(md).toContain("TEST MART");
    expect(md).toContain("お茶");
    expect(md).toContain("明細");
    expect(md).toContain("集計");
  });
});

describe("image security / hash", () => {
  it("rejects unsupported types", () => {
    expect(() =>
      assertSupportedImage({
        mimeType: "application/pdf",
        fileName: "a.pdf",
        byteLength: 100,
      }),
    ).toThrow(ImageValidationError);
  });

  it("hashes identical bytes the same", () => {
    const a = hashImageBytes(Buffer.from("abc"));
    const b = hashImageBytes(Buffer.from("abc"));
    expect(a).toBe(b);
  });
});
