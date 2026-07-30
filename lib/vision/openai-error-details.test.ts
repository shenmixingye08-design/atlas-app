import { describe, expect, it } from "vitest";

import { APIError } from "openai";

import {
  extractOpenAiVisionErrorDetails,
  inspectVisionDataUrl,
  sanitizeOpenAiMessage,
} from "./openai-error-details";

describe("openai-error-details", () => {
  it("inspects data URL mime and byte length", () => {
    const raw = Buffer.from("hello-image-bytes!!");
    const dataUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
    const meta = inspectVisionDataUrl(dataUrl);
    expect(meta.mimeType).toBe("image/jpeg");
    expect(meta.imageByteLength).toBe(raw.byteLength);
    expect(meta.base64Length).toBeGreaterThan(10);
  });

  it("extracts APIError status/type/code/param/requestId without secrets", () => {
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
    });
    expect(details.httpStatus).toBe(400);
    expect(details.openaiErrorType).toBe("invalid_request_error");
    expect(details.openaiErrorCode).toBe("invalid_image_format");
    expect(details.param).toBe("input");
    expect(details.requestId).toBe("req_abc123");
    expect(details.safeMessage).toContain("[redacted]");
    expect(details.safeMessage).not.toContain("sk-secret");
    expect(details.model).toBe("gpt-5.5");
    expect(details.apiFormat).toBe("responses");
  });

  it("sanitizes data URLs in messages", () => {
    const msg = sanitizeOpenAiMessage(
      "bad data:image/png;base64,AAAA payload",
    );
    expect(msg).toContain("[redacted]");
    expect(msg).not.toContain("AAAA");
  });
});
