import "server-only";

import mammoth from "mammoth";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { inspectDocxProduction } from "@/lib/deliverables/word-production/docx-quality";
import { estimatePageCount } from "@/lib/deliverables/generators/docx-renderer";
import { resolveDocumentModel } from "@/lib/deliverables/document-model/normalize-document-model";

export type WordPdfParityReport = {
  ok: boolean;
  reasons: string[];
  docxPagesEstimate: number;
  pdfBytes: number;
  docxBytes: number;
  docxCharCount: number;
  extractedCharCount: number;
  textOverlapRatio: number;
  tableCount: number;
  imageCount: number;
};

function normalizeCompareText(value: string): string {
  return value.replace(/\s+/g, "").replace(/[、。．，・]/g, "");
}

/**
 * Word→PDF parity check without mutating PDF core.
 * Generates a parallel PDF from the same source and compares text/layout signals.
 * (True binary Word→PDF conversion is not used; fidelity is validated via shared content.)
 */
export async function checkWordPdfParity(input: {
  content: string;
  title?: string;
}): Promise<WordPdfParityReport> {
  const reasons: string[] = [];
  const docxGen = new DocxDeliverableGenerator();
  const pdfGen = new PdfDeliverableGenerator();

  const docx = await docxGen.generate(input.content, input.title ?? "parity");
  const pdf = await pdfGen.generate(input.content, input.title ?? "parity");
  const quality = inspectDocxProduction(docx.buffer);
  if (!quality.ok) reasons.push(...quality.reasons.map((r) => `docx:${r}`));

  const resolved = resolveDocumentModel({
    content: input.content,
    title: input.title,
  });
  const docxPagesEstimate = estimatePageCount(resolved.model);

  let extracted = "";
  try {
    const result = await mammoth.extractRawText({ buffer: docx.buffer });
    extracted = result.value ?? "";
  } catch (error) {
    reasons.push(
      `mammoth_failed:${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const sourceNorm = normalizeCompareText(input.content);
  const extractedNorm = normalizeCompareText(extracted);
  const overlap =
    sourceNorm.length === 0
      ? 1
      : [...sourceNorm].filter((ch) => extractedNorm.includes(ch)).length /
        sourceNorm.length;

  if (overlap < 0.35) {
    reasons.push(`text_overlap_low:${overlap.toFixed(3)}`);
  }
  if (pdf.buffer.byteLength < 800) reasons.push("pdf_too_small");
  if (docx.buffer.byteLength < 1_500) reasons.push("docx_too_small");

  // Page count: PDF deep page extract is optional; use size heuristic + Word estimate.
  // Require both artifacts present and Word OOXML clean.
  return {
    ok: reasons.length === 0,
    reasons,
    docxPagesEstimate,
    pdfBytes: pdf.buffer.byteLength,
    docxBytes: docx.buffer.byteLength,
    docxCharCount: quality.charCount,
    extractedCharCount: extractedNorm.length,
    textOverlapRatio: overlap,
    tableCount: quality.tableCount,
    imageCount: quality.imageCount,
  };
}
