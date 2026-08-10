import { describe, expect, it } from "vitest";

import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";

import { listPptxTemplates } from "./registry";
import { resolvePptxDesign } from "./resolve";
import { inspectPptxDesignParts } from "./theme-ooxml";

const SAMPLE = `# 提案資料

## 背景
- 課題A
- 課題B

## 施策

| 項目 | 金額 |
| --- | ---: |
| A | 100 |
| B | 200 |
`;

describe("P3-04 PPT design templates", () => {
  it("registers distinct design templates", () => {
    const templates = listPptxTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
    expect(new Set(templates.map((t) => t.designMarker)).size).toBe(
      templates.length,
    );
  });

  it("maps automation theme values to template ids", () => {
    expect(resolvePptxDesign({ theme: "blue" }).template.id).toBe("business");
    expect(resolvePptxDesign({ theme: "neutral" }).template.id).toBe("simple");
    expect(resolvePptxDesign({ theme: "brand" }).template.id).toBe("proposal");
  });

  it("embeds distinct design markers and theme accents per template", async () => {
    const gen = new PptxDeliverableGenerator();
    const business = await gen.generate(SAMPLE, "biz", {
      powerpoint: { templateId: "business" },
    });
    const pitch = await gen.generate(SAMPLE, "pitch", {
      powerpoint: { templateId: "pitch" },
    });
    const b = await inspectPptxDesignParts(business.buffer);
    const p = await inspectPptxDesignParts(pitch.buffer);
    expect(b.designMarker).toBe("P304TMPL_BUSINESS");
    expect(p.designMarker).toBe("P304TMPL_PITCH");
    expect(b.accentHex).toBe("1F4E79");
    expect(p.accentHex).toBe("111827");
    expect(b.themeName).toMatch(/ATLAS/);
  });

  it("applies brandColorHex into OOXML accent", async () => {
    const file = await new PptxDeliverableGenerator().generate(SAMPLE, "brand", {
      powerpoint: { templateId: "proposal", brandColorHex: "AB1234" },
    });
    const parts = await inspectPptxDesignParts(file.buffer);
    expect(parts.accentHex).toBe("AB1234");
  });

  it("honors slideCountHint by not exceeding unconstrained deck", async () => {
    const gen = new PptxDeliverableGenerator();
    const compact = await gen.generate(SAMPLE, "hint", {
      powerpoint: { templateId: "business", slideCountHint: 5 },
    });
    const full = await gen.generate(SAMPLE, "full", {
      powerpoint: { templateId: "business" },
    });
    const c = await inspectPptxDesignParts(compact.buffer);
    const f = await inspectPptxDesignParts(full.buffer);
    expect(c.slideCount).toBeGreaterThan(0);
    expect(f.slideCount).toBeGreaterThanOrEqual(c.slideCount);
  });

  it("keeps P1-08 real tables in templated decks", async () => {
    const file = await new PptxDeliverableGenerator().generate(SAMPLE, "tbl", {
      powerpoint: { templateId: "report" },
    });
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(file.buffer);
    let hasTable = false;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.includes("slide")) continue;
      const text = await entry.async("string");
      if (text.includes("<a:tbl")) {
        hasTable = true;
        break;
      }
    }
    expect(hasTable).toBe(true);
  });
});
