import "server-only";

import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";

import { inspectPptxProduction } from "./pptx-inspect";

export type PptxPdfParityResult = {
  ok: boolean;
  reasons: string[];
  mode: "parallel_source_pdf";
  slideCount: number;
  pdfBytes: number;
};

/**
 * PowerPoint→PDF parity (CI-safe): generate PDF from the same source content.
 * Does not modify PDF generator internals; true LibreOffice convert is CI-external.
 */
export async function verifyPptxPdfParity(
  content: string,
): Promise<PptxPdfParityResult> {
  const reasons: string[] = [];
  const pptx = await new PptxDeliverableGenerator().generate(
    content,
    "pptx-pdf-parity",
  );
  const inspect = inspectPptxProduction(pptx.buffer);
  if (!inspect.ok) reasons.push(...inspect.reasons.map((r) => `pptx:${r}`));

  const pdf = await new PdfDeliverableGenerator().generate(
    content,
    "pptx-pdf-parity",
  );
  if (!pdf.buffer.subarray(0, 4).toString("utf8").startsWith("%PDF")) {
    reasons.push("invalid_pdf");
  }
  if (pdf.buffer.byteLength < 800) reasons.push("pdf_too_small");
  if (inspect.slideCount < 1) reasons.push("no_slides");

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    mode: "parallel_source_pdf",
    slideCount: inspect.slideCount,
    pdfBytes: pdf.buffer.byteLength,
  };
}
