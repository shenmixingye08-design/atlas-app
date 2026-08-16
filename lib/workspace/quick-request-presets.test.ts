import { describe, expect, it } from "vitest";

import { QUICK_REQUEST_PRESETS } from "./quick-request-presets";

describe("QUICK_REQUEST_PRESETS", () => {
  it("includes the beginner templates with non-empty prompts", () => {
    expect(QUICK_REQUEST_PRESETS).toHaveLength(7);
    const labels = QUICK_REQUEST_PRESETS.map((item) => item.label);
    expect(labels).toEqual([
      "今日のX投稿",
      "毎朝のX投稿",
      "取引先メール",
      "予定を登録",
      "Excelにまとめる",
      "毎週自動実行",
      "PowerPoint資料",
    ]);
    expect(labels).not.toContain("画像生成");
    expect(labels).not.toContain("動画生成");
    for (const preset of QUICK_REQUEST_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.prompt.trim()).not.toBe("");
    }
  });

  it("maps materials preset to PowerPoint sales-material trigger text", () => {
    const materials = QUICK_REQUEST_PRESETS.find((item) => item.id === "materials");
    expect(materials?.label).toContain("PowerPoint");
    expect(materials?.prompt).toContain("PowerPoint");
    expect(materials?.prompt).toContain("営業資料");
  });
});
