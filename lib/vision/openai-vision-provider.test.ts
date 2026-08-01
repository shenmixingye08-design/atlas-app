import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/openai", () => ({
  createAtlasResponse: vi.fn(),
  resolveAtlasResponseCreateParams: vi.fn((params: { model?: string }) => ({
    model: params.model ?? "gpt-5.5",
    max_output_tokens: 8192,
    temperature: null,
    tools: null,
    response_format: null,
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
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";

async function sampleJpeg() {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("openAiVisionProvider request shape", () => {
  beforeEach(() => {
    vi.mocked(createAtlasResponse).mockReset();
    vi.mocked(createAtlasResponse).mockResolvedValue({
      id: "resp_test",
      output_text: JSON.stringify({
        detectedType: "general_photo",
        confidence: 0.8,
        summary: "青い空と山",
        extractedText: null,
        language: "ja",
        fields: { note: "ok" },
        tables: [],
        visualElements: ["空", "山"],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: [],
      }),
      status: "completed",
      model: "gpt-5.5",
    } as Awaited<ReturnType<typeof createAtlasResponse>>);
  });

  it("never sends MIME-spoofed bytes (webp labeled jpeg) to OpenAI", async () => {
    const webp = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .webp()
      .toBuffer();

    // Old bug path: trust DB mime and skip magic checks.
    // New path: normalize re-encodes webp → jpeg, then validate passes.
    const result = await openAiVisionProvider.analyzeImage({
      userId: "user_1",
      attachmentId: "att_1",
      imageUrl: `data:image/jpeg;base64,${webp.toString("base64")}`,
      imageBytes: webp,
      userText: "これは何？",
      hintType: "unknown",
      detail: "auto",
      pageIndex: 0,
      pageCount: 1,
    });
    expect(result.result.summary).toBeTruthy();
    const call = vi.mocked(createAtlasResponse).mock.calls[0]?.[0];
    const content = (
      call?.input as Array<{ content: Array<{ type?: string; image_url?: string }> }>
    )[0]?.content;
    const imagePart = content?.find((part) => part.type === "input_image");
    expect(String(imagePart?.image_url)).toMatch(/^data:image\/jpeg;base64,/);
    // Payload after normalize must be real JPEG magic, not RIFF/WEBP.
    const b64 = String(imagePart?.image_url).split(",")[1] ?? "";
    const decoded = Buffer.from(b64, "base64");
    expect(decoded[0]).toBe(0xff);
    expect(decoded[1]).toBe(0xd8);
    expect(decoded[2]).toBe(0xff);
  });

  it("sends input_text + input_image data URL with detail=high (not auto)", async () => {
    const jpeg = await sampleJpeg();
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    await openAiVisionProvider.analyzeImage({
      userId: "user_a",
      attachmentId: "img_1",
      imageUrl: dataUrl,
      imageBytes: jpeg,
      userText: "この画像に何が写っているか説明してください",
      hintType: "general_photo",
      detail: "auto",
      pageIndex: 0,
      pageCount: 1,
      diagnosticId: "vdiag_test",
    });

    expect(createAtlasResponse).toHaveBeenCalled();
    const call = vi.mocked(createAtlasResponse).mock.calls[0]?.[0];
    expect(call?.aiTaskType).toBe("vision_analyze");
    const message = (call?.input as Array<{ role: string; content: unknown[] }>)[0];
    expect(message?.role).toBe("user");
    const content = message?.content as Array<Record<string, unknown>>;
    expect(content.some((part) => part.type === "input_text")).toBe(true);
    const imagePart = content.find((part) => part.type === "input_image");
    expect(imagePart).toMatchObject({
      type: "input_image",
      detail: "high",
    });
    expect(String(imagePart?.image_url)).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("retries then succeeds on OpenAI 500", async () => {
    const { APIError } = await import("openai");
    vi.mocked(createAtlasResponse)
      .mockRejectedValueOnce(
        new APIError(
          500,
          { message: "server error", type: "server_error", code: "server_error" },
          undefined,
          new Headers({ "x-request-id": "req_500" }),
        ),
      )
      .mockResolvedValueOnce({
        id: "resp_ok",
        output_text: JSON.stringify({
          detectedType: "general_photo",
          confidence: 0.7,
          summary: "再試行成功",
          extractedText: "ok",
          language: "ja",
          fields: { ok: true },
          tables: [],
          visualElements: [],
          layout: null,
          styleSignals: null,
          warnings: [],
          missingFields: [],
          recommendedActions: [],
          artifactSuggestions: [],
        }),
        status: "completed",
        model: "gpt-5.5",
      } as Awaited<ReturnType<typeof createAtlasResponse>>);

    const jpeg = await sampleJpeg();
    const result = await openAiVisionProvider.analyzeImage({
      userId: "user_a",
      attachmentId: "img_1",
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      imageBytes: jpeg,
      userText: "説明して",
      hintType: "general_photo",
      detail: "high",
      pageIndex: 0,
      pageCount: 1,
    });
    expect(result.result.summary).toContain("再試行成功");
    expect(createAtlasResponse).toHaveBeenCalledTimes(2);
  });

  it("preserves OpenAI API error fields after exhausted retries", async () => {
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
        new Headers({ "x-request-id": "req_vision_1" }),
      ),
    );

    const jpeg = await sampleJpeg();
    await expect(
      openAiVisionProvider.analyzeImage({
        userId: "user_a",
        attachmentId: "img_1",
        imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        imageBytes: jpeg,
        userText: "解析して",
        hintType: "general_photo",
        detail: "high",
        pageIndex: 0,
        pageCount: 1,
        diagnosticId: "vdiag_err",
        jobId: "job_err",
      }),
    ).rejects.toMatchObject({
      name: "VisionError",
      code: "openai_failed",
      details: expect.objectContaining({
        httpStatus: 400,
        openaiErrorCode: "invalid_image",
        requestId: "req_vision_1",
      }),
    });
    // 400-class input errors must not be auto-retried.
    expect(vi.mocked(createAtlasResponse).mock.calls.length).toBe(1);
  });

  it("fails empty output_text instead of treating as success", async () => {
    vi.mocked(createAtlasResponse).mockResolvedValue({
      id: "resp_empty",
      output_text: "   ",
      status: "completed",
      model: "gpt-5.5",
    } as Awaited<ReturnType<typeof createAtlasResponse>>);

    const jpeg = await sampleJpeg();
    await expect(
      openAiVisionProvider.analyzeImage({
        userId: "user_a",
        attachmentId: "img_1",
        imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        imageBytes: jpeg,
        userText: "解析して",
        hintType: "general_photo",
        detail: "high",
        pageIndex: 0,
        pageCount: 1,
      }),
    ).rejects.toMatchObject({
      code: "openai_failed",
      details: expect.objectContaining({
        openaiErrorCode: "empty_content",
      }),
    });
  });
});
