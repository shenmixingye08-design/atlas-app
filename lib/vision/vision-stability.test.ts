import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/openai", () => ({
  createAtlasResponse: vi.fn(),
  resolveAtlasResponseCreateParams: vi.fn((params: { model?: string }) => ({
    model: params.model ?? "gpt-5.5",
    max_output_tokens: 8192,
    temperature: null,
    tools: null,
    response_format: params,
    text_format: null,
    previous_response_id: null,
  })),
}));

vi.mock("@/lib/vision/diagnostics", () => ({
  appendVisionDiagnosticStage: vi.fn(),
  getVisionDiagnosticForUser: vi.fn(() => null),
}));

vi.mock("@/lib/vision/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vision/retry")>();
  return {
    ...actual,
    sleep: vi.fn(async () => undefined),
  };
});

import { createAtlasResponse } from "@/lib/openai";
import { evaluateVisionBatchGate } from "@/lib/vision/gate";
import {
  VISION_OPENAI_TIMEOUT_MS,
  openAiVisionProvider,
} from "@/lib/vision/openai-vision-provider";
import { normalizeImageForOpenAi } from "@/lib/vision/normalize-for-openai";
import {
  isNonRetryableOpenAiFailure,
  isRetryableOpenAiFailure,
  visionRetryDelayMs,
  VISION_RETRY_DELAYS_MS,
} from "@/lib/vision/retry";
import { parseVisionStructuredPayload } from "@/lib/vision/structured-output";
import { visionPhaseForError } from "@/lib/vision/job-phase";
import type { VisionBatchResult } from "@/lib/vision/types";

async function sampleJpeg(width = 640, height = 480) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

const baseInput = {
  userId: "u1",
  attachmentId: "a1",
  userText: "説明して",
  hintType: "general_photo" as const,
  detail: "high" as const,
  pageIndex: 0,
  pageCount: 1,
};

function successPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_ok",
    output_text: JSON.stringify({
      image_readable: true,
      document_type: "general_photo",
      detected_fields: [{ key: "note", value: "ok" }],
      missing_required_fields: [],
      confidence: 0.8,
      needs_user_input: false,
      user_message: "",
      summary: "青い空と山",
      extracted_text: "ok",
      language: "ja",
      tables: [],
      visual_elements: ["空"],
      warnings: [],
      recommended_actions: [],
      artifact_suggestions: [],
      ...overrides,
    }),
    status: "completed",
    model: "gpt-5.5",
  } as Awaited<ReturnType<typeof createAtlasResponse>>;
}

describe("vision stability — timeouts / retries / structured outputs", () => {
  beforeEach(() => {
    vi.mocked(createAtlasResponse).mockReset();
  });

  it("uses ≥60s OpenAI timeout", () => {
    expect(VISION_OPENAI_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("uses fixed retry delays 2s / 5s / 10s", () => {
    expect(VISION_RETRY_DELAYS_MS).toEqual([2_000, 5_000, 10_000]);
    expect(visionRetryDelayMs(1)).toBe(2_000);
    expect(visionRetryDelayMs(2)).toBe(5_000);
    expect(visionRetryDelayMs(3)).toBe(10_000);
  });

  it("analyzes a normal image successfully", async () => {
    vi.mocked(createAtlasResponse).mockResolvedValue(successPayload());
    const jpeg = await sampleJpeg();
    const result = await openAiVisionProvider.analyzeImage({
      ...baseInput,
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      imageBytes: jpeg,
      jobId: "job_ok",
      diagnosticId: "diag_ok",
    });
    expect(result.result.summary).toContain("青い空");
    expect(result.result.fields.__visionGate).toMatchObject({
      image_readable: true,
      needs_user_input: false,
    });
    expect(createAtlasResponse).toHaveBeenCalledTimes(1);
    const call = vi.mocked(createAtlasResponse).mock.calls[0]?.[0];
    expect(call?.textFormat?.type).toBe("json_schema");
  });

  it("retries on first timeout then succeeds", async () => {
    vi.mocked(createAtlasResponse)
      .mockRejectedValueOnce(
        Object.assign(new Error("vision_openai_timeout"), {
          name: "AbortError",
          code: "timeout",
        }),
      )
      .mockResolvedValueOnce(successPayload({ summary: "2回目成功" }));

    const jpeg = await sampleJpeg();
    const result = await openAiVisionProvider.analyzeImage({
      ...baseInput,
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      imageBytes: jpeg,
    });
    expect(result.result.summary).toContain("2回目成功");
    expect(createAtlasResponse).toHaveBeenCalledTimes(2);
  });

  it("fails after all timeout retries without becoming needs_input", async () => {
    vi.mocked(createAtlasResponse).mockRejectedValue(
      Object.assign(new Error("vision_openai_timeout"), {
        name: "AbortError",
        code: "timeout",
      }),
    );
    const jpeg = await sampleJpeg();
    await expect(
      openAiVisionProvider.analyzeImage({
        ...baseInput,
        imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        imageBytes: jpeg,
      }),
    ).rejects.toMatchObject({
      name: "VisionError",
      code: "timeout",
    });
    expect(vi.mocked(createAtlasResponse).mock.calls.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(visionPhaseForError({ code: "timeout" })).toBe("failed");
    expect(visionPhaseForError({ code: "timeout" })).not.toBe("needs_input");
  });

  it("retries 429 then succeeds", async () => {
    const { APIError } = await import("openai");
    vi.mocked(createAtlasResponse)
      .mockRejectedValueOnce(
        new APIError(
          429,
          {
            message: "rate limit",
            type: "rate_limit_error",
            code: "rate_limit_exceeded",
          },
          undefined,
          new Headers({ "x-request-id": "req_429" }),
        ),
      )
      .mockResolvedValueOnce(successPayload({ summary: "429後成功" }));

    const jpeg = await sampleJpeg();
    const result = await openAiVisionProvider.analyzeImage({
      ...baseInput,
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      imageBytes: jpeg,
    });
    expect(result.result.summary).toContain("429後成功");
    expect(createAtlasResponse).toHaveBeenCalledTimes(2);
  });

  it("does not retry 400 invalid MIME / invalid_image", async () => {
    const { APIError } = await import("openai");
    vi.mocked(createAtlasResponse).mockRejectedValue(
      new APIError(
        400,
        {
          message: "Image could not be processed",
          type: "invalid_request_error",
          code: "invalid_image",
          param: "input_image",
        },
        undefined,
        new Headers({ "x-request-id": "req_400" }),
      ),
    );
    const jpeg = await sampleJpeg();
    await expect(
      openAiVisionProvider.analyzeImage({
        ...baseInput,
        imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        imageBytes: jpeg,
      }),
    ).rejects.toMatchObject({ code: "openai_failed" });
    expect(createAtlasResponse).toHaveBeenCalledTimes(1);
    expect(
      isNonRetryableOpenAiFailure({
        httpStatus: 400,
        openaiErrorType: "invalid_request_error",
        openaiErrorCode: "invalid_image",
        param: "input_image",
        requestId: "req_400",
        safeMessage: "Image could not be processed",
        rawErrorBody: null,
        model: "gpt-5.5",
        inputTypes: ["input_text", "input_image"],
        mimeType: "image/jpeg",
        imageByteLength: 100,
        base64Length: 100,
        imageCount: 1,
        urlLength: 100,
        timedOut: false,
        responseStatus: null,
        apiFormat: "responses",
      }),
    ).toBe(true);
  });

  it("rejects 0-byte images before OpenAI", async () => {
    await expect(
      normalizeImageForOpenAi({ buffer: Buffer.alloc(0), profile: "standard" }),
    ).rejects.toMatchObject({ code: "empty_image" });
    expect(createAtlasResponse).not.toHaveBeenCalled();
  });

  it("shrinks large phone images under long-edge 2048 and logs size reduction", async () => {
    const huge = await sampleJpeg(4000, 3000);
    const out = await normalizeImageForOpenAi({
      buffer: huge,
      profile: "standard",
      diagnosticId: "diag_size",
    });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
    expect(out.originalByteLength).toBe(huge.length);
    expect(out.byteLength).toBeLessThanOrEqual(huge.length);
    expect(out.byteLength).toBeLessThanOrEqual(10_000_000);
    expect(out.mimeType).toBe("image/jpeg");
  });

  it("maps structured needs_user_input to needs_input (not timeout)", () => {
    const batch: VisionBatchResult = {
      id: "b1",
      images: [
        {
          id: "i1",
          attachmentId: "a1",
          detectedType: "business_card",
          confidence: 0.7,
          summary: "名刺",
          extractedText: "会社名のみ",
          language: "ja",
          fields: {
            companyName: "ACME",
            __visionGate: {
              image_readable: true,
              document_type: "business_card",
              needs_user_input: true,
              user_message: "氏名が見つかりません",
              missing_required_fields: ["name"],
            },
          },
          tables: [],
          visualElements: [],
          layout: null,
          styleSignals: null,
          warnings: [],
          missingFields: ["name"],
          recommendedActions: [],
          artifactSuggestions: [],
          model: "gpt-5.5",
          detailLevel: "high",
          createdAt: new Date().toISOString(),
        },
      ],
      combinedSummary: "名刺",
      commonFields: {},
      differences: [],
      mergedTables: [],
      warnings: [],
      recommendedArtifactType: null,
      status: "needs_input",
      model: "gpt-5.5",
      detailLevel: "high",
      createdAt: new Date().toISOString(),
      needsInput: { message: "氏名が見つかりません", fields: ["name"] },
    };
    const gate = evaluateVisionBatchGate({
      batch,
      userText: "氏名と住所を抽出",
    });
    expect(gate.status).toBe("needs_input");
    expect(gate.analysisSuccess).toBe(true);
    expect(visionPhaseForError({ gateStatus: "needs_input" })).toBe(
      "needs_input",
    );
    expect(visionPhaseForError({ code: "timeout" })).toBe("failed");
  });

  it("parses structured outputs without free-text inference", () => {
    const parsed = parseVisionStructuredPayload(
      JSON.stringify({
        image_readable: true,
        document_type: "invoice",
        detected_fields: [{ key: "total", value: "1000" }],
        missing_required_fields: ["dueDate"],
        confidence: 0.55,
        needs_user_input: true,
        user_message: "支払期限がありません",
        summary: "請求書",
        extracted_text: "合計 1000",
        language: "ja",
        tables: [],
        visual_elements: [],
        warnings: [],
        recommended_actions: [],
        artifact_suggestions: ["invoice_excel"],
      }),
    );
    expect(parsed.image_readable).toBe(true);
    expect(parsed.needs_user_input).toBe(true);
    expect(parsed.detectedType).toBe("invoice");
    expect(parsed.fields.total).toBe("1000");
    expect(parsed.missing_required_fields).toContain("dueDate");
  });

  it("retry policy: timeout/429/5xx yes, 400 no", () => {
    expect(
      isRetryableOpenAiFailure({
        httpStatus: null,
        openaiErrorType: null,
        openaiErrorCode: "timeout",
        param: null,
        requestId: null,
        safeMessage: "vision_openai_timeout",
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
    expect(
      isRetryableOpenAiFailure({
        httpStatus: 400,
        openaiErrorType: "invalid_request_error",
        openaiErrorCode: "invalid_image",
        param: null,
        requestId: null,
        safeMessage: "bad",
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
    ).toBe(false);
  });
});

describe("vision reanalyze idempotency helpers", () => {
  it("keeps timeout and needs_input phases distinct for deliverable gating", () => {
    expect(visionPhaseForError({ code: "timeout" })).toBe("failed");
    // timeout always wins — never coerce to needs_input.
    expect(
      visionPhaseForError({ code: "timeout", gateStatus: "needs_input" }),
    ).toBe("failed");
    expect(visionPhaseForError({ gateStatus: "needs_input" })).toBe(
      "needs_input",
    );
  });
});
