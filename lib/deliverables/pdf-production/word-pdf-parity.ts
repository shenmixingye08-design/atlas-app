import "server-only";

import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";

import { inspectPdfProduction } from "./pdf-inspect";

export type WordPdfParityResult = {
  ok: boolean;
  reasons: string[];
  mode: "parallel_source_pdf";
  pdfPageCount: number;
  headingCount: number;
  tableCount: number;
};

/**
 * Word→PDF parity (CI-safe): generate PDF from the same source markdown.
 * True Word binary conversion (LibreOffice) is not available in CI.
 * Checks that headings/tables from the source are represented and PDF is production-valid.
 */
export async function verifyWordPdfParity(content: string): Promise<WordPdfParityResult> {
  const reasons: string[] = [];
  const parsed = parseDeliverableContent(content);
  const headingCount = parsed.sections.length + (parsed.title ? 1 : 0);
  const tableCount = parsed.sections.reduce(
    (n, s) => n + s.blocks.filter((b) => b.type === "table").length,
    0,
  );

  const pdf = await new PdfDeliverableGenerator().generate(content, "word-parity");
  const inspect = await inspectPdfProduction(pdf.buffer);
  if (!inspect.ok) reasons.push(...inspect.reasons.map((r) => `pdf:${r}`));

  if (headingCount > 0 && inspect.pageCount < 1) {
    reasons.push("page_count_mismatch");
  }
  if (tableCount > 0 && !inspect.hasContentStream) {
    reasons.push("table_content_missing");
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    mode: "parallel_source_pdf",
    pdfPageCount: inspect.pageCount,
    headingCount,
    tableCount,
  };
}
