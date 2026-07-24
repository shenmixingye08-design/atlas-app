import { describe, expect, it } from "vitest";

import { buildDeliverableBaseName } from "@/lib/deliverables/filename";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { MarkdownDeliverableGenerator } from "@/lib/deliverables/generators/markdown-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import {
  buildExportMarkdown,
  getDeliverableExportText,
} from "@/lib/orchestration/deliverable-export";
import { isDeliverableJsonText } from "@/lib/orchestration/deliverable-display";

const ATLAS_DOCUMENT = {
  ...emptyDeliverable("document"),
  type: "document" as const,
  title: "ATLAS紹介文",
  summary: "ATLASはデータ統合と自動化を支援するサービスです。",
  content: "ATLASは、分散するデータを統合し、業務効率化を支援します。",
};

const SALES_EMAIL = {
  ...emptyDeliverable("email"),
  type: "email" as const,
  title: "営業メール",
  summary: "太陽光発電のご提案",
  content: "件名：太陽光発電のご提案\n\n建設会社の皆様\n\nお世話になっております。",
  metadata: {
    ...emptyDeliverable("email").metadata,
    subject: "太陽光発電のご提案",
  },
};

describe("deliverable-export", () => {
  it("builds Japanese document export markdown", () => {
    const markdown = buildExportMarkdown(ATLAS_DOCUMENT);
    expect(markdown).toContain("# ATLAS紹介文");
    expect(markdown).toContain("## 概要");
    expect(markdown).toContain("## 本文");
    expect(markdown).toContain("ATLASは、分散するデータを統合し");
    expect(isDeliverableJsonText(markdown)).toBe(false);
  });

  it("builds Japanese email export with 件名 and 本文", () => {
    const markdown = getDeliverableExportText(SALES_EMAIL);
    expect(markdown).toContain("# 営業メール");
    expect(markdown).toContain("## 件名");
    expect(markdown).toContain("## 本文");
    expect(markdown).toContain("太陽光発電のご提案");
    expect(markdown).not.toMatch(/^\s*\{/m);
  });

  it("unwraps JSON embedded in content before export", () => {
    const embedded = JSON.stringify({
      type: "document",
      title: "ATLAS紹介文",
      summary: "概要",
      content: "本文テキスト",
    });
    const deliverable = {
      ...emptyDeliverable("document"),
      content: embedded,
    };
    const markdown = getDeliverableExportText(deliverable);
    expect(markdown).toContain("ATLAS紹介文");
    expect(markdown).toContain("本文テキスト");
    expect(isDeliverableJsonText(markdown)).toBe(false);
  });

  it("uses Japanese-compatible filenames", () => {
    expect(buildDeliverableBaseName("ignored", "ATLAS紹介文")).toBe("ATLAS紹介文");
    expect(buildDeliverableBaseName("ignored", "営業メール")).toBe("営業メール");
  });
});

describe("deliverable generators", () => {
  it("writes UTF-8 markdown export", async () => {
    const markdown = getDeliverableExportText(SALES_EMAIL);
    const file = await new MarkdownDeliverableGenerator().generate(markdown, "営業メール");
    expect(file.fileName).toBe("営業メール.md");
    expect(file.buffer.toString("utf8")).toContain("## 件名");
    expect(file.buffer.toString("utf8")).toContain("## 本文");
  });

  it("generates a valid docx file for Japanese export text", async () => {
    const markdown = getDeliverableExportText(ATLAS_DOCUMENT);
    const file = await new DocxDeliverableGenerator().generate(markdown, "ATLAS紹介文");
    expect(file.fileName).toBe("ATLAS紹介文.docx");
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(file.buffer.length).toBeGreaterThan(2000);
  });

  it("generates a valid Japanese PDF without Helvetica", async () => {
    const markdown = getDeliverableExportText(ATLAS_DOCUMENT);
    const file = await new PdfDeliverableGenerator().generate(markdown, "ATLAS紹介文");
    expect(file.fileName).toBe("ATLAS紹介文.pdf");
    const pdfText = file.buffer.toString("latin1");
    expect(pdfText.startsWith("%PDF")).toBe(true);
    expect(pdfText.includes("%%EOF")).toBe(true);
    expect(file.buffer.length).toBeGreaterThan(3000);
    expect(pdfText).not.toContain("Helvetica");
  });

  it("still generates Word/PDF alongside Excel for table markdown", async () => {
    const tableMarkdown = `# 一覧

| 名前 | 値 |
| --- | --- |
| A | 1 |
`;
    const docx = await new DocxDeliverableGenerator().generate(tableMarkdown, "一覧");
    const pdf = await new PdfDeliverableGenerator().generate(tableMarkdown, "一覧");
    const xlsx = await new XlsxDeliverableGenerator().generate(tableMarkdown, "一覧");
    expect(docx.fileName).toBe("一覧.docx");
    expect(pdf.fileName).toBe("一覧.pdf");
    expect(xlsx.fileName).toBe("一覧.xlsx");
    expect(docx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(pdf.buffer.toString("latin1").startsWith("%PDF")).toBe(true);
    expect(xlsx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
