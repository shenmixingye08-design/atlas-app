import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { preprocessImageBuffer } from "@/lib/attachments/preprocess";
import { enhanceImageForVision, estimateSkewDegrees } from "@/lib/vision/enhance-image";
import {
  formatsFromVisionBatch,
  selectFormatsFromVision,
  titleFromVisionBatch,
} from "@/lib/vision/formats-from-vision";
import {
  VISION_PIPELINE_STEPS,
  visionPhaseForError,
  visionPhaseLabel,
  visionPipelineStepIndex,
} from "@/lib/vision/job-phase";
import { normalizeImageForOpenAi } from "@/lib/vision/normalize-for-openai";
import {
  parseVisionStructuredPayload,
  VISION_STRUCTURED_OUTPUT_SCHEMA,
  VISION_TEXT_FORMAT,
} from "@/lib/vision/structured-output";
import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";
import { VISION_OPENAI_TIMEOUT_MS, VISION_JOB_BUDGET_MS } from "@/lib/vision/openai-vision-provider";
import {
  VISION_MAX_ATTEMPTS,
  VISION_TIMEOUT_MAX_ATTEMPTS,
  VISION_RETRY_DELAYS_MS,
  isRetryableOpenAiFailure,
  isNonRetryableOpenAiFailure,
} from "@/lib/vision/retry";
import { VISION_QUALITY_FEATURE_EVALUATION } from "@/lib/vision/feature-evaluation";

async function makePhoto(opts: {
  width?: number;
  height?: number;
  brightness?: number;
  rotate?: number;
  blur?: number;
  textLike?: boolean;
}): Promise<Buffer> {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 900;
  const brightness = opts.brightness ?? 180;
  let img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: brightness,
        g: brightness,
        b: Math.max(40, brightness - 20),
      },
    },
  });

  // Draw a simple “table / receipt” band for text-like docs.
  if (opts.textLike) {
    const overlay = await sharp({
      create: {
        width: Math.floor(width * 0.8),
        height: 40,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer();
    img = sharp(await img.png().toBuffer()).composite([
      { input: overlay, top: 80, left: 40 },
      { input: overlay, top: 140, left: 40 },
      { input: overlay, top: 200, left: 40 },
    ]);
  }

  if (opts.rotate) {
    img = sharp(await img.png().toBuffer()).rotate(opts.rotate, {
      background: "#808080",
    });
  }
  if (opts.blur) {
    img = sharp(await img.png().toBuffer()).blur(opts.blur);
  }
  return img.jpeg({ quality: 85 }).toBuffer();
}

function stubBatch(
  type: VisionDetectedType,
  recommended: string | null = null,
  suggestions: string[] = [],
): VisionBatchResult {
  return {
    id: `batch_${type}`,
    images: [
      {
        id: `img_${type}`,
        attachmentId: `att_${type}`,
        detectedType: type,
        confidence: 0.9,
        summary: `${type} sample`,
        extractedText: "sample text 金額 1200",
        language: "ja",
        fields: {},
        tables: [],
        visualElements: [],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: suggestions,
        model: "test",
        detailLevel: "auto",
        createdAt: new Date().toISOString(),
      },
    ],
    combinedSummary: `${type}`,
    commonFields: { detectedType: type },
    differences: [],
    mergedTables: [],
    warnings: [],
    recommendedArtifactType: recommended,
    status: "analyzed",
    model: "test",
    detailLevel: "auto",
    createdAt: new Date().toISOString(),
  };
}

const DOCUMENT_TYPES: VisionDetectedType[] = [
  "receipt",
  "invoice",
  "estimate",
  "contract",
  "business_document",
  "sales_material",
  "table",
  "spreadsheet_source",
  "chart",
  "handwritten_note",
  "business_card",
  "whiteboard",
  "screenshot",
  "property_photo",
  "equipment_photo",
  "social_media_reference",
  "design_reference",
  "general_photo",
  "unknown",
];

describe("vision quality — feature evaluation & budgets", () => {
  it("records P0 evaluation", () => {
    expect(VISION_QUALITY_FEATURE_EVALUATION.priority).toBe("P0");
    expect(VISION_QUALITY_FEATURE_EVALUATION.reducesHabitualWork).toBe(true);
  });

  it("keeps timeout budget ≥60s and job budget ≥120s", () => {
    expect(VISION_OPENAI_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(VISION_JOB_BUDGET_MS).toBeGreaterThanOrEqual(120_000);
    expect(VISION_TIMEOUT_MAX_ATTEMPTS).toBeGreaterThanOrEqual(4);
    expect(VISION_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(VISION_RETRY_DELAYS_MS).toEqual([2_000, 5_000, 10_000]);
  });

  it("structured output uses json_schema strict mode (no free-form)", () => {
    expect(VISION_TEXT_FORMAT.type).toBe("json_schema");
    expect(VISION_TEXT_FORMAT.strict).toBe(true);
    expect(VISION_STRUCTURED_OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect(VISION_STRUCTURED_OUTPUT_SCHEMA.required).toContain("document_type");
    expect(VISION_STRUCTURED_OUTPUT_SCHEMA.required).toContain("layout_hierarchy");
    expect(VISION_STRUCTURED_OUTPUT_SCHEMA.required).toContain("recommended_formats");
  });
});

describe("vision quality — pipeline UI phases", () => {
  it("exposes 画像受信→補正→AI解析→成果物→完成 steps", () => {
    expect(VISION_PIPELINE_STEPS).toEqual([
      "image_received",
      "preprocessing",
      "analyzing",
      "artifact_generating",
      "completed",
    ]);
    expect(visionPhaseLabel("image_received")).toBe("画像受信");
    expect(visionPhaseLabel("preprocessing")).toBe("画像補正");
    expect(visionPhaseLabel("analyzing")).toBe("AI解析");
    expect(visionPhaseLabel("artifact_generating")).toBe("成果物生成");
    expect(visionPhaseLabel("completed")).toBe("完成");
  });

  it.each([
    ["queued", 0],
    ["image_received", 0],
    ["preprocessing", 1],
    ["analyzing", 2],
    ["retrying", 2],
    ["artifact_generating", 3],
    ["completed", 4],
    ["failed", -1],
    ["needs_input", -1],
  ] as const)("step index for %s → %s", (phase, index) => {
    expect(visionPipelineStepIndex(phase)).toBe(index);
  });

  it("timeout never maps to needs_input", () => {
    expect(visionPhaseForError({ code: "timeout" })).toBe("failed");
    expect(
      visionPhaseForError({ code: "timeout", gateStatus: "needs_input" }),
    ).toBe("failed");
  });
});

describe("vision quality — retry policy", () => {
  it("retries timeout/429/5xx only", () => {
    expect(
      isRetryableOpenAiFailure({
        timedOut: true,
        httpStatus: null,
        openaiErrorCode: null,
        openaiErrorType: null,
        safeMessage: "timeout",
      } as never),
    ).toBe(true);
    expect(
      isNonRetryableOpenAiFailure({
        httpStatus: 400,
        openaiErrorCode: "invalid_image",
        openaiErrorType: "invalid_request_error",
        timedOut: false,
        safeMessage: "bad",
      } as never),
    ).toBe(true);
  });
});

describe("vision quality — format auto-selection matrix", () => {
  it.each(DOCUMENT_TYPES)("selects at least one format for %s", (type) => {
    const formats = formatsFromVisionBatch(stubBatch(type));
    expect(formats.length).toBeGreaterThan(0);
    expect(titleFromVisionBatch(stubBatch(type)).length).toBeGreaterThan(0);
  });

  it.each([
    ["receipt", "xlsx"],
    ["invoice", "xlsx"],
    ["table", "xlsx"],
    ["spreadsheet_source", "xlsx"],
    ["contract", "docx"],
    ["business_card", "docx"],
    ["handwritten_note", "docx"],
    ["whiteboard", "docx"],
    ["screenshot", "docx"],
    ["chart", "pptx"],
  ] as const)("%s primary includes %s", (type, fmt) => {
    expect(formatsFromVisionBatch(stubBatch(type))).toContain(fmt);
  });

  it("honors explicit PowerPoint / Markdown asks", () => {
    expect(
      formatsFromVisionBatch(stubBatch("sales_material"), "スライドでPowerPointにして"),
    ).toContain("pptx");
    expect(
      formatsFromVisionBatch(stubBatch("general_photo"), "Markdownでまとめて"),
    ).toContain("md");
  });

  it("can return multiple formats when PDF requested", () => {
    const selected = selectFormatsFromVision(
      stubBatch("receipt"),
      "レシートをExcelとPDFで",
    );
    expect(selected.formats).toContain("xlsx");
    expect(selected.formats).toContain("pdf");
  });
});

describe("vision quality — image fixture matrix (≥100 cases)", () => {
  const fixtureSpecs = [
    // Photos
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `photo_${i}`,
      opts: { width: 800 + i * 40, height: 600 + i * 20, brightness: 140 + i * 5 },
    })),
    // Dark images
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `dark_${i}`,
      opts: { brightness: 20 + i * 3, width: 1000, height: 750 },
    })),
    // Skewed / rotated
    ...[-8, -5, -3, -1, 1, 2, 3, 5, 7, 10, 12, 15].map((deg, i) => ({
      name: `skew_${i}`,
      opts: { rotate: deg, textLike: true, width: 1100, height: 800 },
    })),
    // Blurry
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `blur_${i}`,
      opts: { blur: 0.5 + i * 0.15, textLike: true },
    })),
    // Dense text-like (tables / receipts)
    ...Array.from({ length: 16 }, (_, i) => ({
      name: `table_receipt_${i}`,
      opts: {
        textLike: true,
        width: 900 + i * 30,
        height: 1200,
        brightness: 200,
      },
    })),
    // Business card-ish small
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `card_${i}`,
      opts: { width: 640, height: 360 + i * 4, textLike: true, brightness: 220 },
    })),
    // Mixed stress
    ...Array.from({ length: 24 }, (_, i) => ({
      name: `mixed_${i}`,
      opts: {
        width: 640 + (i % 5) * 100,
        height: 480 + (i % 4) * 80,
        brightness: 40 + (i % 10) * 18,
        rotate: i % 3 === 0 ? 4 : 0,
        blur: i % 4 === 0 ? 1.2 : 0,
        textLike: i % 2 === 0,
      },
    })),
  ] as const;

  it(`covers ${fixtureSpecs.length} synthetic fixtures`, () => {
    expect(fixtureSpecs.length).toBeGreaterThanOrEqual(100);
  });

  it.each(fixtureSpecs.map((s) => [s.name, s.opts] as const))(
    "preprocess fixture: %s",
    async (_name, opts) => {
      const raw = await makePhoto(opts);
      expect(raw.length).toBeGreaterThan(400);
      // Upload-time path (fast): EXIF/resize; enhance when text-like.
      const processed = await preprocessImageBuffer({
        buffer: raw,
        detail: opts.textLike ? "high" : "auto",
        preferReadableText: Boolean(opts.textLike),
      });
      expect(processed.buffer.length).toBeGreaterThan(400);
      expect(processed.width).toBeGreaterThan(0);
      expect(processed.height).toBeGreaterThan(0);
    },
  );

  it("OpenAI normalize path works for dark/skew/blur/receipt samples", async () => {
    const samples = [
      await makePhoto({ brightness: 25 }),
      await makePhoto({ rotate: 6, textLike: true }),
      await makePhoto({ blur: 1.5, textLike: true }),
      await makePhoto({ textLike: true, width: 1600, height: 2200 }),
    ];
    for (const raw of samples) {
      const normalized = await normalizeImageForOpenAi({
        buffer: raw,
        profile: "ocr",
      });
      expect(normalized.byteLength).toBeGreaterThan(500);
      expect(normalized.byteLength).toBeLessThanOrEqual(10_000_000);
      expect(normalized.warnings.some((w) => w.startsWith("enhance:"))).toBe(true);
    }
  });
});

describe("vision quality — upload preprocess", () => {
  it("applies enhance path for readable text uploads", async () => {
    const raw = await makePhoto({ textLike: true, rotate: 6, brightness: 210 });
    const result = await preprocessImageBuffer({
      buffer: raw,
      detail: "high",
      preferReadableText: true,
    });
    expect(result.buffer.length).toBeGreaterThan(500);
    expect(result.warnings.some((w) => w.startsWith("enhance:"))).toBe(true);
  });

  it("estimates skew for tilted documents", async () => {
    const raw = await makePhoto({ textLike: true, rotate: 5, width: 1000, height: 1400 });
    const angle = await estimateSkewDegrees(raw, 8);
    expect(typeof angle).toBe("number");
    expect(Math.abs(angle)).toBeLessThanOrEqual(8);
  });
});

describe("vision quality — structured JSON parse", () => {
  it("rejects free-form non-JSON and accepts schema payload", () => {
    expect(() => parseVisionStructuredPayload("これは自由文です")).toThrow();
    const payload = parseVisionStructuredPayload(
      JSON.stringify({
        image_readable: true,
        document_type: "receipt",
        detected_fields: [{ key: "total", value: "1200" }],
        missing_required_fields: [],
        confidence: 0.91,
        needs_user_input: false,
        user_message: "",
        summary: "スーパーのレシート",
        extracted_text: "合計 1200円",
        language: "ja",
        tables: [
          {
            headers: ["品名", "金額"],
            rows: [["牛乳", "198"]],
            notes: null,
          },
        ],
        visual_elements: ["logo"],
        warnings: [],
        recommended_actions: ["家計簿へ"],
        artifact_suggestions: ["household_excel"],
        layout_hierarchy: "header>items>total",
        layout_sections: ["header", "items", "total"],
        structure_notes: "縦型レシート",
        recommended_formats: ["xlsx", "pdf"],
      }),
    );
    expect(payload.detectedType).toBe("receipt");
    expect(payload.image_readable).toBe(true);
    expect(payload.artifactSuggestions).toEqual(
      expect.arrayContaining(["household_excel", "xlsx", "pdf"]),
    );
    expect(payload.fields.layoutHierarchy).toBe("header>items>total");
  });
});
