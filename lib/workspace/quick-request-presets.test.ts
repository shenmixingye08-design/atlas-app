import { describe, expect, it } from "vitest";

import { QUICK_REQUEST_PRESETS } from "./quick-request-presets";

describe("QUICK_REQUEST_PRESETS", () => {
  it("includes all workspace quick actions with non-empty prompts", () => {
    expect(QUICK_REQUEST_PRESETS).toHaveLength(8);
    for (const preset of QUICK_REQUEST_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.prompt.trim()).not.toBe("");
    }
  });

  it("maps sales preset to sales material wizard trigger text", () => {
    const sales = QUICK_REQUEST_PRESETS.find((item) => item.id === "sales");
    expect(sales?.prompt).toBe("営業資料を作ってください");
  });
});
