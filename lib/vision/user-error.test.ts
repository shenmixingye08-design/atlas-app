import { describe, expect, it } from "vitest";

import {
  VISION_NEEDS_INPUT_USER_MESSAGE,
  VISION_NETWORK_USER_MESSAGE,
  VISION_RATE_LIMIT_USER_MESSAGE,
  VISION_TIMEOUT_USER_MESSAGE,
  VISION_UNSUPPORTED_IMAGE_USER_MESSAGE,
  userMessageForVisionFailure,
} from "@/lib/vision/user-error";

describe("userMessageForVisionFailure", () => {
  it("maps timeout to temporary congestion copy (not content-missing)", () => {
    const message = userMessageForVisionFailure({
      code: "timeout",
      openaiMessage: "vision_openai_timeout",
    });
    expect(message).toBe(VISION_TIMEOUT_USER_MESSAGE);
    expect(message).toContain("画像解析サーバーが混み合っています");
    expect(message).not.toContain("画像内に該当情報");
    expect(message).not.toContain("読み取れませんでした");
  });

  it("maps unsupported / rate_limit / network distinctly", () => {
    expect(
      userMessageForVisionFailure({ code: "unsupported_type" }),
    ).toBe(VISION_UNSUPPORTED_IMAGE_USER_MESSAGE);
    expect(
      userMessageForVisionFailure({ code: "rate_limited", httpStatus: 429 }),
    ).toBe(VISION_RATE_LIMIT_USER_MESSAGE);
    expect(
      userMessageForVisionFailure({
        code: "network",
        openaiMessage: "ECONNRESET",
      }),
    ).toBe(VISION_NETWORK_USER_MESSAGE);
  });

  it("exports needs_input copy for gate reuse", () => {
    expect(VISION_NEEDS_INPUT_USER_MESSAGE).toBe(
      "画像から依頼内容を読み取れませんでした。",
    );
  });
});
