import { describe, expect, it } from "vitest";

import { CsvDeliverableGenerator } from "./csv-generator";
import { DocxDeliverableGenerator } from "./docx-generator";
import { MarkdownDeliverableGenerator } from "./markdown-generator";
import { PdfDeliverableGenerator } from "./pdf-generator";
import { PlainTextDeliverableGenerator } from "./plain-text-generator";
import { PptxDeliverableGenerator } from "./pptx-generator";
import { XlsxDeliverableGenerator } from "./xlsx-generator";

const SAMPLE = `# 営業企画書

## 概要
本資料は提案の骨子です。

## 数値

| 項目 | 金額 | 日付 |
| --- | --- | --- |
| 売上 | 1000000 | 2026-01-15 |
| 原価 | 400000 | 2026-01-16 |
| 粗利 | =B2-B3 | 2026-01-17 |

## 要点
- 顧客課題を明確化する
- 導入効果を定量で示す
`;

describe("deliverable generators", () => {
  it("generates markdown and text", async () => {
    const md = await new MarkdownDeliverableGenerator().generate(SAMPLE, "sample");
    const txt = await new PlainTextDeliverableGenerator().generate(SAMPLE, "sample");
    expect(md.format).toBe("md");
    expect(txt.format).toBe("txt");
    expect(md.buffer.length).toBeGreaterThan(10);
    expect(txt.buffer.length).toBeGreaterThan(10);
  });

  it("generates csv from tables", async () => {
    const csv = await new CsvDeliverableGenerator().generate(SAMPLE, "sample");
    expect(csv.format).toBe("csv");
    const text = csv.buffer.toString("utf-8");
    expect(text).toContain("項目");
    expect(text).toContain("売上");
  });

  it("generates searchable japanese pdf", async () => {
    const pdf = await new PdfDeliverableGenerator().generate(SAMPLE, "sample");
    expect(pdf.format).toBe("pdf");
    expect(pdf.buffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    expect(pdf.buffer.length).toBeGreaterThan(1000);
  });

  it("generates word docx", async () => {
    const docx = await new DocxDeliverableGenerator().generate(SAMPLE, "sample");
    expect(docx.format).toBe("docx");
    expect(docx.buffer.length).toBeGreaterThan(1000);
  });

  it("generates powerpoint pptx", async () => {
    const pptx = await new PptxDeliverableGenerator().generate(SAMPLE, "sample");
    expect(pptx.format).toBe("pptx");
    expect(pptx.buffer.length).toBeGreaterThan(1000);
  });

  it("generates excel xlsx with tables", async () => {
    const xlsx = await new XlsxDeliverableGenerator().generate(SAMPLE, "sample");
    expect(xlsx.format).toBe("xlsx");
    expect(xlsx.buffer.length).toBeGreaterThan(1000);
    // ZIP/OOXML signature
    expect(xlsx.buffer[0]).toBe(0x50);
    expect(xlsx.buffer[1]).toBe(0x4b);
  });
});
