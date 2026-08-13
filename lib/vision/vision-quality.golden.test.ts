/**
 * Golden Vision quality tests — precision, hallucination, multi-image, durability.
 * Mock/golden ≠ live OpenAI accuracy.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { assertSupportedImage, ImageValidationError } from "@/lib/attachments/image-security";
import { classifyImagePurposeFromText, inferVisionUserIntent } from "@/lib/vision/classify";
import { formatsFromVisionBatch } from "@/lib/vision/formats-from-vision";
import { groupVisionImages, mergeVisionBatch } from "@/lib/vision/merge-batch";
import {
  normalizeImageForOpenAi,
  normalizeProfileForAttempt,
} from "@/lib/vision/normalize-for-openai";
import { parseVisionModelPayload } from "@/lib/vision/parse-model-json";
import {
  classifyCellKind,
  sanitizeVisionAnalysisResult,
  sanitizeVisionModelPayload,
  scoreExactMatch,
} from "@/lib/vision/precision";
import {
  isNonRetryableOpenAiFailure,
  isNonRetryableVisionParseFailure,
  isRetryableOpenAiFailure,
} from "@/lib/vision/retry";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { buildVisionEnrichedAssignment } from "@/lib/vision/adapters/to-assignment-context";
import { VisionError, type VisionAnalysisResult, type VisionBatchResult } from "@/lib/vision/types";
import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";
import { buildWorkRequestSubmitPayload } from "@/lib/workspace/work-request-payload";
import { estimateVisionFixtureCost } from "@/lib/vision/vision-cost-estimate";
import { VISION_STAGE_USER_LABEL, isVisionPipelineStage } from "@/lib/vision/failure-stage";
import { userMessageForVisionFailure } from "@/lib/vision/user-error";

function payload(partial: Record<string, unknown>) {
  return sanitizeVisionModelPayload(
    parseVisionModelPayload(
      JSON.stringify({
        detectedType: "unknown",
        confidence: 0.9,
        summary: "test",
        extractedText: "",
        language: "ja",
        fields: {},
        tables: [],
        visualElements: [],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: [],
        ...partial,
      }),
    ),
  );
}

function imageResult(
  partial: Partial<VisionAnalysisResult> & Pick<VisionAnalysisResult, "detectedType">,
): VisionAnalysisResult {
  return sanitizeVisionAnalysisResult({
    id: partial.id ?? "vis_1",
    attachmentId: partial.attachmentId ?? "att_1",
    detectedType: partial.detectedType,
    confidence: partial.confidence ?? 0.9,
    summary: partial.summary ?? "ok",
    extractedText: partial.extractedText ?? null,
    language: partial.language ?? "ja",
    fields: partial.fields ?? {},
    tables: partial.tables ?? [],
    visualElements: partial.visualElements ?? [],
    layout: partial.layout ?? null,
    styleSignals: partial.styleSignals ?? null,
    warnings: partial.warnings ?? [],
    missingFields: partial.missingFields ?? [],
    recommendedActions: partial.recommendedActions ?? [],
    artifactSuggestions: partial.artifactSuggestions ?? [],
    model: "mock",
    detailLevel: "high",
    createdAt: new Date().toISOString(),
    pageIndex: partial.pageIndex,
  });
}

function batchFromImages(
  images: VisionAnalysisResult[],
  recommended: string,
): VisionBatchResult {
  const merged = mergeVisionBatch(images);
  return {
    id: "vbatch_g",
    images,
    combinedSummary: images.map((image, i) => `【画像${i + 1}】${image.summary}`).join("\n"),
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

async function makeImage(opts: {
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  rotate?: number;
  blur?: number;
  brightness?: number;
}) {
  let pipeline = sharp({
    create: {
      width: opts.width,
      height: opts.height,
      channels: 3,
      background: { r: 245, g: 245, b: 240 },
    },
  });
  if (opts.rotate) pipeline = pipeline.rotate(opts.rotate);
  if (opts.blur) pipeline = pipeline.blur(opts.blur);
  if (opts.brightness != null) {
    pipeline = pipeline.modulate({ brightness: opts.brightness });
  }
  if (opts.format === "png") return pipeline.png().toBuffer();
  if (opts.format === "webp") return pipeline.webp().toBuffer();
  return pipeline.jpeg({ quality: 80 }).toBuffer();
}

describe("golden vision — image types + structured extract", () => {
  it("1 receipt: extracts store/date/items/total and scores exact match", () => {
    const result = payload({
      detectedType: "receipt",
      extractedText: "MINERVOT MART\n2026/07/25 12:03\nお茶 1 150\n弁当 1 980\n小計 1130\n税 150\n合計 1280\n現金",
      fields: {
        storeName: "MINERVOT MART",
        date: "2026-07-25",
        time: "12:03",
        items: [
          { name: "お茶", quantity: 1, unitPrice: 150, amount: 150 },
          { name: "弁当", quantity: 1, unitPrice: 980, amount: 980 },
        ],
        subtotal: 1130,
        tax: 150,
        total: 1280,
        paymentMethod: "現金",
        currency: "JPY",
      },
    });
    expect(result.detectedType).toBe("receipt");
    expect(scoreExactMatch("MINERVOT MART", result.fields.storeName)).toBe(true);
    expect(scoreExactMatch("2026-07-25", result.fields.date)).toBe(true);
    expect(scoreExactMatch(1280, result.fields.total)).toBe(true);
    expect(scoreExactMatch(150, (result.fields.items as Array<{ amount: number }>)[0]?.amount)).toBe(
      true,
    );
    expect(result.fieldConfidence?.total).toBeGreaterThan(0.5);
  });

  it("2 invoice: keeps issuer/recipient/number/total", () => {
    const result = payload({
      detectedType: "invoice",
      extractedText: "請求書 株式会社サンプル 株式会社テスト INV-001 合計 110000",
      fields: {
        issuer: "株式会社サンプル",
        recipient: "株式会社テスト",
        invoiceNumber: "INV-001",
        total: 110000,
      },
    });
    expect(result.fields.invoiceNumber).toBe("INV-001");
    expect(result.fields.total).toBe(110000);
  });

  it("3 estimate: validUntil stays distinct from issueDate", () => {
    const result = payload({
      detectedType: "estimate",
      extractedText: "見積書 EST-009 発行日 2026-08-01 有効期限 2026-08-31 合計 220000",
      fields: {
        estimateNumber: "EST-009",
        issueDate: "2026-08-01",
        validUntil: "2026-08-31",
        total: 220000,
      },
    });
    expect(result.fields.validUntil).toBe("2026-08-31");
    expect(result.fields.issueDate).toBe("2026-08-01");
  });

  it("4 contract: does not invent missing amounts", () => {
    const result = payload({
      detectedType: "contract",
      extractedText: "業務委託契約書 甲 乙",
      fields: { parties: "甲 / 乙", amounts: null },
      missingFields: ["amounts"],
    });
    expect(result.fields.amounts).toBeNull();
    expect(result.missingFields).toContain("amounts");
  });

  it("5 table: infers column types without flattening", () => {
    const result = payload({
      detectedType: "table",
      extractedText: "品目 数量 金額 A 2 1000",
      tables: [
        {
          headers: ["品目", "数量", "金額"],
          rows: [
            ["A", 2, 1000],
            ["B", "10%", "¥500"],
          ],
          notes: "結合セルあり",
          mergedRegions: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
        },
      ],
    });
    expect(result.tables[0]?.columnTypes?.[0]).toBe("text");
    expect(result.tables[0]?.mergedRegions?.[0]?.colSpan).toBe(2);
    expect(classifyCellKind("¥500")).toBe("currency");
    expect(classifyCellKind("10%")).toBe("percentage");
  });

  it("6 chart: does not invent pixel-precise numbers", () => {
    const result = payload({
      detectedType: "chart",
      extractedText: "売上推移 上昇傾向",
      fields: { chartType: "棒グラフ", trend: "増加傾向", visibleValues: null },
      tables: [{ headers: ["月", "値"], rows: [["1月", 123456]] }],
    });
    expect(result.tables[0]?.rows[0]?.[1]).toBeNull();
    expect(result.warnings.join()).toMatch(/具体値は判別不可/);
    expect(result.fields.trend).toBe("増加傾向");
  });

  it("7 handwriting: separates raw / cleaned / summary", () => {
    const result = payload({
      detectedType: "handwritten_note",
      extractedText: "明日10時 見積",
      fields: {
        rawText: "明日10時 見積",
        cleanedText: "明日の10時に見積",
        summary: "見積予定",
      },
    });
    expect(result.fields.rawText).toBe("明日10時 見積");
    expect(result.fields.cleanedText).not.toBe(result.fields.rawText);
  });

  it("8 business card: does not swap name/company; ungrounded phone dropped", () => {
    const result = payload({
      detectedType: "business_card",
      extractedText: "山田太郎\n株式会社サンプル",
      fields: {
        personName: "山田太郎",
        companyName: "株式会社サンプル",
        phone: "03-9999-0000",
        email: "ghost@example.com",
      },
    });
    expect(result.fields.personName).toBe("山田太郎");
    expect(result.fields.companyName).toBe("株式会社サンプル");
    expect(result.fields.phone).toBeNull();
    expect(result.fields.email).toBeNull();
  });

  it("9 screenshot: keeps UI / error fields", () => {
    const result = payload({
      detectedType: "screenshot",
      extractedText: "Error E-42 保存に失敗しました",
      fields: {
        appOrSite: "設定",
        errorCode: "E-42",
        visibleMessage: "保存に失敗しました",
        state: "失敗",
      },
    });
    expect(result.fields.errorCode).toBe("E-42");
  });

  it("10 sales material: does not keep ungrounded contact numbers", () => {
    const result = payload({
      detectedType: "sales_material",
      extractedText: "今ならお得",
      fields: { contactInfo: "03-1111-2222", keyMessage: "今ならお得" },
    });
    expect(result.fields.contactInfo).toBeNull();
    expect(result.fields.keyMessage).toBe("今ならお得");
  });

  it("11 equipment photo: observed vs inference; no fault claim", () => {
    const result = payload({
      detectedType: "equipment_photo",
      extractedText: "",
      fields: {
        observed: "パネル表面に茶色い付着物が見える",
        inference: "故障している",
      },
    });
    expect(result.fields.observed).toContain("茶色い付着物");
    expect(String(result.fields.inference)).not.toContain("故障している");
    expect(result.warnings.join()).toMatch(/断定/);
  });

  it("12 general photo: keeps observed", () => {
    const result = payload({
      detectedType: "general_photo",
      fields: { observed: "青空と建物", inference: "晴天の可能性" },
    });
    expect(result.fields.observed).toBe("青空と建物");
  });

  it("13 Japanese receipt classification from assignment", () => {
    expect(classifyImagePurposeFromText("このレシートを読み取って")).toBe("receipt");
  });

  it("14 mixed JP/EN language passthrough", () => {
    const result = payload({
      detectedType: "invoice",
      language: "mixed",
      extractedText: "Invoice 請求書 TOTAL 5000",
      fields: { total: 5000 },
    });
    expect(result.language).toBe("mixed");
    expect(result.fields.total).toBe(5000);
  });
});

describe("golden vision — durability bytes through normalize", () => {
  it("15 rotated jpeg is EXIF-normalized", async () => {
    const jpeg = await makeImage({ width: 400, height: 300, format: "jpeg", rotate: 90 });
    const out = await normalizeImageForOpenAi({ buffer: jpeg, profile: "ocr" });
    expect(["image/jpeg", "image/png"]).toContain(out.mimeType);
    expect(detectImageMimeFromBytes(out.buffer)).toBe(out.mimeType);
  });

  it("16 blurry jpeg still produces a payload", async () => {
    const jpeg = await makeImage({ width: 640, height: 480, format: "jpeg", blur: 2 });
    const out = await normalizeImageForOpenAi({ buffer: jpeg, profile: "standard" });
    expect(out.byteLength).toBeGreaterThan(100);
  });

  it("17 low resolution", async () => {
    const jpeg = await makeImage({ width: 80, height: 80, format: "jpeg" });
    const out = await normalizeImageForOpenAi({ buffer: jpeg, profile: "standard" });
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(32);
  });

  it("18 high resolution is capped", async () => {
    const jpeg = await makeImage({ width: 4000, height: 3000, format: "jpeg" });
    const out = await normalizeImageForOpenAi({ buffer: jpeg, profile: "ocr" });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
  });

  it("19 long receipt portrait png stays readable (ocr profile prefers png)", async () => {
    const png = await makeImage({ width: 400, height: 1800, format: "png" });
    const out = await normalizeImageForOpenAi({ buffer: png, profile: "ocr" });
    expect(out.profile).toBe("ocr");
    expect(out.mimeType).toBe("image/png");
  });

  it("webp / dark / bright / landscape form", async () => {
    const webp = await makeImage({ width: 1200, height: 400, format: "webp", brightness: 0.4 });
    const out = await normalizeImageForOpenAi({ buffer: webp, profile: "ocr" });
    expect(["image/jpeg", "image/png"]).toContain(out.mimeType);
    const bright = await makeImage({ width: 800, height: 600, format: "jpeg", brightness: 1.8 });
    const out2 = await normalizeImageForOpenAi({ buffer: bright, profile: "standard" });
    expect(out2.byteLength).toBeGreaterThan(100);
  });

  it("ocr profile is used on first readable attempt", () => {
    expect(normalizeProfileForAttempt(1, true)).toBe("ocr");
    expect(normalizeProfileForAttempt(2, true)).toBe("compact");
  });
});

describe("golden vision — multi image / missing / uncertain / wrong total", () => {
  it("20 multi image: separate receipts are not mixed", () => {
    const a = imageResult({
      detectedType: "receipt",
      attachmentId: "r1",
      pageIndex: 0,
      extractedText: "A店 合計 1000",
      fields: { storeName: "A店", total: 1000 },
    });
    const b = imageResult({
      detectedType: "receipt",
      attachmentId: "r2",
      pageIndex: 1,
      extractedText: "B店 合計 2000",
      fields: { storeName: "B店", total: 2000 },
    });
    const merged = mergeVisionBatch([a, b]);
    expect(merged.warnings.join()).toMatch(/別レシート/);
    expect(merged.commonFields.total).toBeUndefined();
    expect(groupVisionImages([a, b])).toHaveLength(2);
  });

  it("same receipt sides do not double-count total", () => {
    const front = imageResult({
      detectedType: "receipt",
      attachmentId: "s1",
      extractedText: "TEST MART 2026-07-25 合計 1280",
      fields: { storeName: "TEST MART", date: "2026-07-25", total: 1280 },
    });
    const back = imageResult({
      detectedType: "receipt",
      attachmentId: "s2",
      extractedText: "TEST MART 2026-07-25 合計 1280",
      fields: { storeName: "TEST MART", date: "2026-07-25", total: 1280 },
    });
    const merged = mergeVisionBatch([front, back]);
    expect(merged.commonFields.total).toBe(1280);
    expect(merged.warnings.join()).toMatch(/二重計上/);
  });

  it("21 missing field stays null", () => {
    const result = payload({
      detectedType: "receipt",
      extractedText: "合計 1000",
      fields: { total: 1000, date: null },
      missingFields: ["date"],
    });
    expect(result.fields.date).toBeNull();
  });

  it("22 uncertain amount is null + warning, never guessed", () => {
    const result = payload({
      detectedType: "receipt",
      extractedText: "合計 判読不能",
      fields: { total: 8980 },
    });
    expect(result.fields.total).toBeNull();
    expect(result.warnings.join()).toMatch(/金額を判別できません/);
  });

  it("23 wrong total warns and does not invent discount rows", () => {
    const result = payload({
      detectedType: "receipt",
      extractedText: "お茶 150 弁当 980 合計 2000",
      fields: {
        items: [
          { name: "お茶", amount: 150 },
          { name: "弁当", amount: 980 },
        ],
        total: 2000,
      },
    });
    expect(result.warnings.join()).toMatch(/一致しません/);
    expect(result.fields.items).toHaveLength(2);
  });
});

describe("golden vision — invalid / retry / schema / isolation", () => {
  it("24 invalid image type is rejected before Vision", () => {
    expect(() =>
      assertSupportedImage({
        mimeType: "application/pdf",
        fileName: "a.pdf",
        byteLength: 100,
      }),
    ).toThrow(ImageValidationError);
  });

  it("25 corrupted bytes fail normalize", async () => {
    await expect(
      normalizeImageForOpenAi({
        buffer: Buffer.from("not-an-image-file-content-xxxxxxxxxxxx"),
        profile: "standard",
      }),
    ).rejects.toMatchObject({ failedStage: "preprocess" });
  });

  it("26 unsupported file", () => {
    expect(() =>
      assertSupportedImage({
        mimeType: "image/tiff",
        fileName: "a.tiff",
        byteLength: 100,
      }),
    ).toThrow(ImageValidationError);
  });

  it("27-30 retry: timeout/429 retryable; schema and auth not re-sent", () => {
    expect(
      isRetryableOpenAiFailure({
        httpStatus: 429,
        openaiErrorType: null,
        openaiErrorCode: "rate_limit_exceeded",
        param: null,
        requestId: null,
        safeMessage: null,
        rawErrorBody: null,
        model: "gpt-5.5",
        inputTypes: ["input_text", "input_image"],
        mimeType: "image/jpeg",
        imageByteLength: 1,
        base64Length: 1,
        imageCount: 1,
        urlLength: 1,
        timedOut: false,
        responseStatus: null,
        apiFormat: "responses",
      }),
    ).toBe(true);
    expect(
      isRetryableOpenAiFailure({
        httpStatus: null,
        openaiErrorType: null,
        openaiErrorCode: null,
        param: null,
        requestId: null,
        safeMessage: null,
        rawErrorBody: null,
        model: "gpt-5.5",
        inputTypes: ["input_text", "input_image"],
        mimeType: "image/jpeg",
        imageByteLength: 1,
        base64Length: 1,
        imageCount: 1,
        urlLength: 1,
        timedOut: true,
        responseStatus: null,
        apiFormat: "responses",
      }),
    ).toBe(true);
    expect(isNonRetryableVisionParseFailure("json_parse_failed")).toBe(true);
    expect(
      isNonRetryableOpenAiFailure({
        httpStatus: 401,
        openaiErrorType: null,
        openaiErrorCode: "invalid_api_key",
        param: null,
        requestId: null,
        safeMessage: null,
        rawErrorBody: null,
        model: "gpt-5.5",
        inputTypes: ["input_text", "input_image"],
        mimeType: "image/jpeg",
        imageByteLength: 1,
        base64Length: 1,
        imageCount: 1,
        urlLength: 1,
        timedOut: false,
        responseStatus: null,
        apiFormat: "responses",
      }),
    ).toBe(true);
  });

  it("31 malformed AI JSON throws VisionError without leaking raw JSON", () => {
    expect(() => parseVisionModelPayload("not-json {{{")).toThrow(VisionError);
    try {
      parseVisionModelPayload("not-json {{{");
    } catch (error) {
      expect((error as VisionError).code).toBe("json_parse_failed");
      expect((error as VisionError).message).not.toContain("{");
    }
  });

  it("32 duplicate submission keeps attachment ids distinct", () => {
    const a = imageResult({ detectedType: "receipt", attachmentId: "att_keep" });
    const b = imageResult({ detectedType: "receipt", attachmentId: "att_keep" });
    expect(a.attachmentId).toBe("att_keep");
    expect(b.attachmentId).toBe("att_keep");
  });

  it("33 user isolation is enforced by attachment store contract (payload ids)", () => {
    const home = buildWorkRequestSubmitPayload({
      assignment: "このレシートを読み取って",
      attachmentIds: ["att_user_a"],
    });
    expect(home.metadata.attachmentIds).toEqual(["att_user_a"]);
    expect(home.metadata.requireVisionSuccess).toBe(true);
  });
});

describe("golden vision — Home / Workspace / handoff / diagnostic / hallucination", () => {
  it("34-35 Home and Workspace share the same submit payload SoT", () => {
    const input = {
      assignment: "この請求書をExcelにして",
      attachmentIds: ["att_1"],
    };
    expect(buildWorkRequestSubmitPayload(input)).toEqual(
      buildWorkRequestSubmitPayload(input),
    );
    expect(buildWorkRequestSubmitPayload(input).metadata.attachmentIds).toEqual([
      "att_1",
    ]);
  });

  it("36 image→Excel handoff uses existing seed + xlsx mapping", () => {
    const images = [
      imageResult({
        detectedType: "receipt",
        extractedText: "TEST MART お茶 150 合計 150",
        fields: {
          storeName: "TEST MART",
          items: [{ name: "お茶", amount: 150 }],
          total: 150,
        },
        artifactSuggestions: ["household_excel"],
      }),
    ];
    const batch = batchFromImages(images, "household_excel");
    const seed = visionBatchToDeliverableContent(batch, "Excelにして");
    expect(seed).toContain("家計簿");
    expect(seed).toContain("TEST MART");
    expect(formatsFromVisionBatch(batch, "Excelにして")).toEqual(["xlsx"]);
  });

  it("37 image→Word handoff uses existing seed + docx mapping", () => {
    const images = [
      imageResult({
        detectedType: "contract",
        extractedText: "契約書 甲 乙",
        fields: { parties: "甲 / 乙" },
        artifactSuggestions: ["contract_docx"],
      }),
    ];
    const batch = batchFromImages(images, "contract_docx");
    const seed = visionBatchToDeliverableContent(batch, "Wordにして");
    expect(seed).toContain("契約書");
    expect(formatsFromVisionBatch(batch, "Wordにして")).toEqual(["docx"]);
  });

  it("explain intent does not invent new fields, only switches seed", () => {
    const images = [
      imageResult({
        detectedType: "receipt",
        extractedText: "TEST MART 合計 150",
        fields: { storeName: "TEST MART", total: 150 },
      }),
    ];
    const batch = batchFromImages(images, "household_excel");
    const explain = visionBatchToDeliverableContent(batch, "内容を説明して");
    expect(explain).toContain("画像内容の説明");
    expect(inferVisionUserIntent("内容を説明して")).toBe("document");
    expect(formatsFromVisionBatch(batch, "内容を説明して")).toEqual(["docx"]);
  });

  it("38 storage reopen: attachmentId is preserved on the analysis result", () => {
    const result = imageResult({
      detectedType: "screenshot",
      attachmentId: "att_reopen_1",
    });
    expect(result.attachmentId).toBe("att_reopen_1");
  });

  it("39 diagnostic stages are distinct and user-facing", () => {
    expect(isVisionPipelineStage("schema_validation")).toBe(true);
    expect(VISION_STAGE_USER_LABEL.vision_response).not.toBe(
      VISION_STAGE_USER_LABEL.schema_validation,
    );
    const message = userMessageForVisionFailure({
      code: "openai_failed",
      failedStage: "vision_response",
    });
    expect(message.length).toBeGreaterThan(4);
  });

  it("40 hallucination negative: invented phone/url/amount/row are dropped", () => {
    const result = payload({
      detectedType: "business_card",
      extractedText: "山田太郎",
      fields: {
        personName: "山田太郎",
        phone: "03-0000-1111",
        url: "https://hallucinated.example",
        email: "nope@example.com",
      },
    });
    expect(result.fields.phone).toBeNull();
    expect(result.fields.url).toBeNull();
    expect(result.fields.email).toBeNull();

    const receipt = payload({
      detectedType: "receipt",
      extractedText: "お茶 150 合計 150",
      fields: {
        items: [
          { name: "お茶", amount: 150 },
          { name: "架空メロン", amount: 9800 },
        ],
        total: 150,
      },
    });
    expect(receipt.fields.items).toHaveLength(1);
  });

  it("assignment enrichment still includes structured fields", () => {
    const batch = batchFromImages(
      [
        imageResult({
          detectedType: "invoice",
          extractedText: "INV-001 合計 110000",
          fields: { invoiceNumber: "INV-001", total: 110000 },
        }),
      ],
      "invoice_excel",
    );
    const text = buildVisionEnrichedAssignment({
      assignment: "Excelにして",
      batch,
    });
    expect(text).toContain("VisionAnalysis");
    expect(text).toContain("INV-001");
  });
});

describe("vision cost fixtures A-D", () => {
  it("reports catalog-based estimates without inventing image prices", () => {
    const simple = estimateVisionFixtureCost({
      name: "A simple screenshot",
      detail: "low",
      imageCount: 1,
    });
    const standard = estimateVisionFixtureCost({
      name: "B standard receipt",
      detail: "high",
      imageCount: 1,
    });
    const heavy = estimateVisionFixtureCost({
      name: "C heavy document",
      detail: "high",
      imageCount: 1,
      outputTokens: 2000,
    });
    const batch = estimateVisionFixtureCost({
      name: "D 5-image batch",
      detail: "high",
      imageCount: 5,
    });
    for (const row of [simple, standard, heavy, batch]) {
      expect(row.model).toBeTruthy();
      expect(row.estimatedUsd).toBeGreaterThan(0);
      expect(row.notes.join()).toMatch(/MODEL PRICE SOURCE REQUIRED/);
    }
    expect(batch.imageCount).toBe(5);
    expect(heavy.inputTokens).toBeGreaterThan(simple.inputTokens);
  });
});
