import { describe, expect, it } from "vitest";

import { QUICK_REQUEST_PRESETS } from "./quick-request-presets";

describe("QUICK_REQUEST_PRESETS", () => {
  it("offers work-intent presets without format/tool labels", () => {
    expect(QUICK_REQUEST_PRESETS.length).toBeGreaterThanOrEqual(4);
    const labels = QUICK_REQUEST_PRESETS.map((item) => item.label);
    expect(labels).toEqual([
      "営業資料を用意",
      "請求をまとめる",
      "議事録を残す",
      "営業メールを用意",
      "写真から報告書",
      "週次報告を作る",
    ]);
    for (const preset of QUICK_REQUEST_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.prompt.trim()).not.toBe("");
      expect(preset.label).not.toMatch(/Word|PDF|Excel|画像生成/i);
    }
  });

  it("maps sales-pack preset to a work completion style prompt", () => {
    const sales = QUICK_REQUEST_PRESETS.find((item) => item.id === "sales-pack");
    expect(sales?.prompt).toContain("営業資料を作って");
    expect(sales?.prompt).toMatch(/整えて/);
  });
});
