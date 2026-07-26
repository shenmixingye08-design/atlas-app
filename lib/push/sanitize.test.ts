import { describe, expect, it } from "vitest";

import { sanitizePushText } from "./sanitize";

describe("sanitizePushText", () => {
  it("strips angle brackets and control characters", () => {
    expect(sanitizePushText("<script>alert(1)</script>\nhello", 100)).toBe(
      "scriptalert(1)/script hello",
    );
  });

  it("truncates to max length", () => {
    expect(sanitizePushText("あいうえお", 3)).toBe("あいう");
  });
});
