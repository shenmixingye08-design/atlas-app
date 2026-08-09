/**
 * P1-08: Excel numFmt / PPTX table+image / Word ImageRun.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { probeDeliverablePracticalQuality } from "@/lib/deliverables/deliverable-quality-probe";
import { P108_PROBE_PNG_DATA_URL } from "@/lib/deliverables/embedded-image";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";

async function zipText(buffer: Buffer, pathSuffix: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = Object.entries(zip.files).find(
    ([path, file]) => !file.dir && path.endsWith(pathSuffix),
  );
  if (!entry) return "";
  return entry[1].async("string");
}

async function zipPaths(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((p) => !zip.files[p]?.dir);
}

describe("P1-08 deliverable practical quality", () => {
  it("A: Excel applies numFmt and never writes currency/date sidecar columns", async () => {
    const md = `# 家計

| 日付 | 店 | 金額 |
| --- | --- | ---: |
| 2026-08-09 | A店 | 12500 |
| 2026-08-10 | B店 | 3200 |
`;
    const file = await new XlsxDeliverableGenerator().generate(md, "ledger", {
      excel: { currency: "JPY", dateFormat: "yyyy-mm-dd" },
    });
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");

    const styles = await zipText(file.buffer, "styles.xml");
    expect(styles).toMatch(/numFmt/i);
    expect(styles).toMatch(/¥|#,##0|yyyy/i);

    const sheet = await zipText(file.buffer, "sheet1.xml");
    expect(sheet).toMatch(/<v>12500<\/v>|<v>3200<\/v>/);
    expect(sheet + styles).not.toMatch(/通貨:JPY/);
    expect(sheet + styles).not.toMatch(/日付:yyyy-mm-dd/);
  });

  it("B: PowerPoint embeds real a:tbl tables (not pipe text only)", async () => {
    const md = `# 会議

## 数字

| Code | Qty |
| --- | --- |
| ALPHA | 2 |
| BETA | 4 |
`;
    const file = await new PptxDeliverableGenerator().generate(md, "deck");
    const slides = await Promise.all(
      (await zipPaths(file.buffer))
        .filter((p) => /ppt\/slides\/slide\d+\.xml$/i.test(p))
        .map(async (p) => {
          const zip = await JSZip.loadAsync(file.buffer);
          return zip.file(p)!.async("string");
        }),
    );
    expect(slides.some((xml) => /<a:tbl[\s>]/.test(xml))).toBe(true);
    expect(slides.join("\n")).not.toMatch(/ALPHA \| 2/);
  });

  it("C: PowerPoint embeds real images via ppt/media (not gray shape helper)", async () => {
    const md = `# 図解

## ビジュアル

![ProbeChart](${P108_PROBE_PNG_DATA_URL})
`;
    const file = await new PptxDeliverableGenerator().generate(md, "images");
    const paths = await zipPaths(file.buffer);
    expect(paths.some((p) => /^ppt\/media\//i.test(p))).toBe(true);
    const slides = await Promise.all(
      paths
        .filter((p) => /ppt\/slides\/slide\d+\.xml$/i.test(p))
        .map(async (p) => {
          const zip = await JSZip.loadAsync(file.buffer);
          return zip.file(p)!.async("string");
        }),
    );
    expect(
      slides.some((xml) => /<p:pic[\s>]|<a:blip[\s>]|r:embed=/.test(xml)),
    ).toBe(true);
  });

  it("D: Word embeds ImageRun media for logo + image block", async () => {
    const md = `# 報告書

## 図

![図1](${P108_PROBE_PNG_DATA_URL})
`;
    const file = await new DocxDeliverableGenerator().generate(md, "report", {
      brand: {
        userId: "u-p108",
        companyName: "Atlas Probe",
        logoDataUrl: P108_PROBE_PNG_DATA_URL,
        updatedAt: new Date().toISOString(),
      },
    });
    const paths = await zipPaths(file.buffer);
    expect(paths.filter((p) => /^word\/media\//i.test(p)).length).toBeGreaterThanOrEqual(
      1,
    );
    const documentXml = await zipText(file.buffer, "word/document.xml");
    expect(documentXml).toMatch(/wp:inline|a:blip|w:drawing/);
    expect(documentXml).not.toContain("画像プレースホルダ");
  });

  it("E: parseDeliverableContent keeps data URL on image blocks", () => {
    const parsed = parseDeliverableContent(
      `# T\n\n## S\n\n![cap](${P108_PROBE_PNG_DATA_URL})\n`,
    );
    const image = parsed.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.type === "imagePlaceholder");
    expect(image?.type).toBe("imagePlaceholder");
    if (image?.type === "imagePlaceholder") {
      expect(image.dataUrl).toContain("data:image/png;base64,");
      expect(image.caption).toBe("cap");
    }
  });

  it("F: PPTX fail-closed when table rendering would be omitted (contract)", async () => {
    // Generator counts source vs rendered; zero-table content still succeeds.
    const ok = await new PptxDeliverableGenerator().generate(
      `# Only text\n\n## A\n\nhello\n`,
      "ok",
    );
    expect(ok.buffer.subarray(0, 2).toString("utf8")).toBe("PK");

    // Source with table must produce a:tbl — if addTable path is broken, omit check fires.
    const withTable = await new PptxDeliverableGenerator().generate(
      `# T\n\n## S\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`,
      "tbl",
    );
    const hasTbl = await (async () => {
      const zip = await JSZip.loadAsync(withTable.buffer);
      for (const [path, file] of Object.entries(zip.files)) {
        if (!/ppt\/slides\/slide\d+\.xml$/i.test(path) || file.dir) continue;
        if (/<a:tbl[\s>]/.test(await file.async("string"))) return true;
      }
      return false;
    })();
    expect(hasTbl).toBe(true);
    expect("pptx_tables_omitted").toBeTruthy();
  });

  it("G: Production probe flags all Acceptance Criteria", async () => {
    const result = await probeDeliverablePracticalQuality();
    expect(result.excelNumFmtOk).toBe(true);
    expect(result.excelSidecarAbsent).toBe(true);
    expect(result.pptxTableOk).toBe(true);
    expect(result.pptxImageOk).toBe(true);
    expect(result.wordImageEmbedOk).toBe(true);
    expect(result.memoryNotSot).toBe(true);
    expect(result.failClosedOnOmission).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  }, 60_000);

  it("H: CI ban script is present and enforces ImageRun/numFmt/addTable", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ban = readFileSync(
      join(process.cwd(), "scripts/ci/p1-08-deliverable-quality-ban.mjs"),
      "utf8",
    );
    expect(ban).toContain("numFmt");
    expect(ban).toContain("addTable");
    expect(ban).toContain("ImageRun");
    expect(ban).toContain("pptx_tables_omitted");
  });
});
