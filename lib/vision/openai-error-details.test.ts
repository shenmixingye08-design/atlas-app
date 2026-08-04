import { describe, expect, it } from "vitest";

import { APIError } from "openai";

import {
  buildVisionOpenAiRequestLog,
  extractOpenAiVisionErrorDetails,
  inspectVisionDataUrl,
  redactImageUrlForLog,
  sanitizeOpenAiMessage,
  serializeOpenAiErrorBody,
} from "./openai-error-details";

describe("openai-error-details", () => {
  it("inspects data URL mime, byte length, base64 size, and url length", () => {
    const raw = Buffer.from("hello-image-bytes!!");
    const dataUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
    const meta = inspectVisionDataUrl(dataUrl);
    expect(meta.mimeType).toBe("image/jpeg");
    expect(meta.imageByteLength).toBe(raw.byteLength);
    expect(meta.base64Length).toBeGreaterThan(10);
    expect(meta.imageCount).toBe(1);
    expect(meta.urlLength).toBe(dataUrl.length);
  });

  it("extracts APIError status/type/code/param/requestId and full body", () => {
    const headers = new Headers({ "x-request-id": "req_abc123" });
    const error = new APIError(
      400,
      {
        message: "Invalid image data sk-secretKEY12345",
        type: "invalid_request_error",
        code: "invalid_image_format",
        param: "input",
      },
      undefined,
      headers,
    );
    const details = extractOpenAiVisionErrorDetails(error, {
      model: "gpt-5.5",
      inputTypes: ["input_text", "input_image"],
      mimeType: "image/jpeg",
      imageByteLength: 343350,
      base64Length: 457823,
      imageCount: 1,
      urlLength: 500000,
    });
    expect(details.httpStatus).toBe(400);
    expect(details.openaiErrorType).toBe("invalid_request_error");
    expect(details.openaiErrorCode).toBe("invalid_image_format");
    expect(details.param).toBe("input");
    expect(details.requestId).toBe("req_abc123");
    expect(details.safeMessage).toContain("[redacted]");
    expect(details.safeMessage).not.toContain("sk-secret");
    expect(details.rawErrorBody).toContain("invalid_image_format");
    expect(details.rawErrorBody).toContain("req_abc123");
    expect(details.model).toBe("gpt-5.5");
    expect(details.apiFormat).toBe("responses");
    expect(details.urlLength).toBe(500000);
  });

  it("serializes full OpenAI error body with required fields", () => {
    const headers = new Headers({ "x-request-id": "req_full_1" });
    const error = new APIError(
      400,
      {
        message: "Image could not be processed",
        type: "invalid_request_error",
        code: "invalid_image",
        param: "input_image",
      },
      undefined,
      headers,
    );
    const body = serializeOpenAiErrorBody(error);
    expect(body).toContain('"status":400');
    expect(body).toContain("invalid_request_error");
    expect(body).toContain("invalid_image");
    expect(body).toContain("Image could not be processed");
    expect(body).toContain("req_full_1");
  });

  it("redacts data URLs in request logs while keeping metrics", () => {
    const dataUrl =
      "data:image/png;base64," + Buffer.from("fake-png-bytes-for-test!!").toString("base64");
    const redacted = redactImageUrlForLog(dataUrl);
    expect(redacted).toContain("data:image/png;base64,[base64_redacted");
    expect(redacted).not.toContain("fake-png");

    const log = buildVisionOpenAiRequestLog({
      model: "gpt-5.5",
      instructions: "test instructions",
      multimodalInput: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "説明して" },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        },
      ],
      tools: null,
      responseFormat: null,
      maxOutputTokens: 4096,
      imageMetrics: inspectVisionDataUrl(dataUrl),
      detail: "high",
      diagnosticId: "vdiag_1",
    });

    expect(log.model).toBe("gpt-5.5");
    expect(log.messages).toBeNull();
    expect(log.tools).toBeNull();
    expect(log.response_format).toBeNull();
    expect(log.max_output_tokens).toBe(4096);
    expect(log.image_url).toContain("[base64_redacted");
    expect(JSON.stringify(log.input)).not.toContain("fake-png");
    expect(
      (log.imageMetrics as { imageCount: number; urlLength: number }).imageCount,
    ).toBe(1);
    expect(
      (log.visionInputSpec as { matchesOfficialResponsesApi: boolean })
        .matchesOfficialResponsesApi,
    ).toBe(true);
  });

  it("sanitizes data URLs in messages", () => {
    const msg = sanitizeOpenAiMessage(
      "bad data:image/png;base64,AAAA payload",
    );
    expect(msg).toContain("[redacted]");
    expect(msg).not.toContain("AAAA");
  });
});
