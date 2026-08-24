import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deliverable batch UI a11y", () => {
  const wizard = readFileSync("components/workspace/deliverable-batch-wizard.tsx", "utf8");
  const detail = readFileSync("components/workspace/deliverable-batch-detail.tsx", "utf8");
  const form = readFileSync("components/workspace/work-request-form.tsx", "utf8");

  it("keeps 1件作成 as default and offers まとめて作成", () => {
    expect(form).toContain("1件作成");
    expect(form).toContain("まとめて作成");
    expect(form).toContain("/workspace?mode=batch");
  });

  it("targets 360/390, 44px, safe-area, and reduced motion", () => {
    for (const source of [wizard, detail]) {
      expect(source).toContain("min-h-[44px]");
      expect(source).toContain("safe-area-inset-bottom");
      expect(source).toContain("overflow-x-hidden");
      expect(source).toContain("motion-reduce");
      expect(source).toContain("min-[390px]");
    }
    expect(wizard).toContain("min-[360px]");
    expect(wizard).not.toContain("約3分");
    expect(wizard).not.toContain("完了予定");
  });

  it("does not expose ココナラ branding or markdown as a batch format", () => {
    expect(wizard).not.toContain("ココナラ");
    expect(wizard).not.toContain('"md"');
    expect(wizard).toContain("テキスト");
    expect(wizard).toContain("Word");
    expect(wizard).toContain("Excel");
    expect(wizard).toContain("PDF");
    expect(wizard).toContain("PowerPoint");
  });
});
