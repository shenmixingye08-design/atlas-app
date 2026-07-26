import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openai", () => ({
  createAtlasResponse: vi.fn(),
}));

vi.mock("@/lib/vision/diagnostics", () => ({
  appendVisionDiagnosticStage: vi.fn(),
}));

import { createAtlasResponse } from "@/lib/openai";
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";

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
        fields: {},
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

  it("sends input_text + input_image data URL with detail to Responses API", async () => {
    const dataUrl =
      "data:image/png;base64," + Buffer.from("fake-png-bytes-for-test!!").toString("base64");

    await openAiVisionProvider.analyzeImage({
      userId: "user_a",
      attachmentId: "img_1",
      imageUrl: dataUrl,
      userText: "この画像に何が写っているか説明してください",
      hintType: "general_photo",
      detail: "high",
      pageIndex: 0,
      pageCount: 1,
      diagnosticId: "vdiag_test",
    });

    expect(createAtlasResponse).toHaveBeenCalledTimes(1);
    const call = vi.mocked(createAtlasResponse).mock.calls[0]?.[0];
    expect(call?.aiTaskType).toBe("vision_analyze");
    expect(call?.model).toBeTruthy();
    expect(Array.isArray(call?.input)).toBe(true);

    const message = (call?.input as Array<{ role: string; content: unknown[] }>)[0];
    expect(message?.role).toBe("user");
    const content = message?.content as Array<Record<string, unknown>>;
    expect(content.some((part) => part.type === "input_text")).toBe(true);
    const imagePart = content.find((part) => part.type === "input_image");
    expect(imagePart).toMatchObject({
      type: "input_image",
      image_url: dataUrl,
      detail: "high",
    });
    expect(String(imagePart?.image_url)).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects non data-url image payloads", async () => {
    await expect(
      openAiVisionProvider.analyzeImage({
        userId: "user_a",
        attachmentId: "img_1",
        imageUrl: "https://example.com/private.png",
        userText: "説明して",
        hintType: "general_photo",
        detail: "auto",
        pageIndex: 0,
        pageCount: 1,
      }),
    ).rejects.toThrow(/形式/);
    expect(createAtlasResponse).not.toHaveBeenCalled();
  });
});
