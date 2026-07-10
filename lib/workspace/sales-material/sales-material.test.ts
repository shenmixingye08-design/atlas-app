import { describe, expect, it } from "vitest";

import { isSalesMaterialRequest } from "./detect";
import { presetToFormats, presetGeneratesFiles } from "./format-presets";
import { buildFallbackSalesOutline } from "./outline-template";

describe("isSalesMaterialRequest", () => {
  it("detects Japanese sales material keywords", () => {
    expect(isSalesMaterialRequest("営業資料を作って")).toBe(true);
    expect(isSalesMaterialRequest("pitch deck for SaaS")).toBe(true);
  });

  it("does not match unrelated requests", () => {
    expect(isSalesMaterialRequest("ブログ記事を書いて")).toBe(false);
  });
});

describe("format presets", () => {
  it("maps presets to deliverable formats", () => {
    expect(presetToFormats("pptx_pdf")).toEqual(["pptx", "pdf"]);
    expect(presetToFormats("txt")).toEqual([]);
    expect(presetGeneratesFiles("txt")).toBe(false);
  });
});

describe("buildFallbackSalesOutline", () => {
  it("returns shorter sections for low cost mode", () => {
    const low = buildFallbackSalesOutline("営業資料", "low");
    const high = buildFallbackSalesOutline("営業資料", "high");
    expect(low.sections.length).toBeLessThan(high.sections.length);
    expect(low.notes).toContain("低コスト");
  });
});
