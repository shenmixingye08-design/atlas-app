import { describe, expect, it } from "vitest";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { PlainTextDeliverableGenerator } from "@/lib/deliverables/generators/plain-text-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";

import { DELIVERABLE_BATCH_LIVE_FORMATS } from "./types";

const BODY = `# 見出し

${"本文です。入力された範囲だけで整理します。".repeat(4)}
`;

describe("deliverable batch live formats", () => {
  it("exposes only currently live generators", () => {
    expect([...DELIVERABLE_BATCH_LIVE_FORMATS]).toEqual([
      "txt",
      "docx",
      "xlsx",
      "pdf",
      "pptx",
    ]);
  });

  it("txt/docx/xlsx/pdf/pptx generators produce non-empty files", async () => {
    const txt = await new PlainTextDeliverableGenerator().generate(BODY, "batch-txt");
    const docx = await new DocxDeliverableGenerator().generate(BODY, "batch-docx");
    const xlsx = await new XlsxDeliverableGenerator().generate(BODY, "batch-xlsx");
    const pdf = await new PdfDeliverableGenerator().generate(BODY, "batch-pdf");
    const pptx = await new PptxDeliverableGenerator().generate(BODY, "batch-pptx");
    expect(txt.buffer.byteLength).toBeGreaterThan(0);
    expect(docx.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(xlsx.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pptx.buffer.subarray(0, 2).toString()).toBe("PK");
  });
});
