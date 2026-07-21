import { describe, expect, it } from "vitest";

import { QUICK_REQUEST_PRESETS } from "./quick-request-presets";

describe("QUICK_REQUEST_PRESETS", () => {
  it("includes the beginner templates with non-empty prompts", () => {
    expect(QUICK_REQUEST_PRESETS).toHaveLength(7);
    const labels = QUICK_REQUEST_PRESETS.map((item) => item.label);
    expect(labels).toEqual([
      "X投稿を作る",
      "ブログを書く",
      "営業メール作成",
      "資料作成",
      "議事録作成",
      "市場調査",
      "画像生成",
    ]);
    for (const preset of QUICK_REQUEST_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.prompt.trim()).not.toBe("");
    }
  });

  it("maps materials preset to sales material wizard trigger text", () => {
    const materials = QUICK_REQUEST_PRESETS.find((item) => item.id === "materials");
    expect(materials?.prompt).toContain("営業資料を作ってください");
  });
});
