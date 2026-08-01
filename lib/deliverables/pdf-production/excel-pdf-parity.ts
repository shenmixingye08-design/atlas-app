import "server-only";

import { extractExcelSheets } from "@/lib/deliverables/excel-data";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { hasPkHeader } from "@/lib/deliverables/integrity";

import { inspectPdfProduction } from "./pdf-inspect";

export type ExcelPdfParityResult = {
  ok: boolean;
  reasons: string[];
  mode: "parallel_source_pdf";
  excelSheetCount: number;
  pdfPageCount: number;
};

/**
 * Excel→PDF parity (CI-safe approximation).
 * Generates PDF from the same tabular source; does not convert .xlsx via Excel print.
 * Does not modify Excel generator code.
 */
export async function verifyExcelPdfParity(input: {
  content: string;
  xlsxBuffer?: Buffer;
}): Promise<ExcelPdfParityResult> {
  const reasons: string[] = [];
  const sheets = extractExcelSheets(input.content);
  if (sheets.length === 0) {
    return {
      ok: false,
      reasons: ["no_sheets"],
      mode: "parallel_source_pdf",
      excelSheetCount: 0,
      pdfPageCount: 0,
    };
  }

  if (input.xlsxBuffer && !hasPkHeader(input.xlsxBuffer)) {
    reasons.push("xlsx_invalid");
  }

  const pdf = await new PdfDeliverableGenerator().generate(
    input.content,
    "excel-parity",
  );
  const inspect = await inspectPdfProduction(pdf.buffer);
  if (!inspect.ok) reasons.push(...inspect.reasons.map((r) => `pdf:${r}`));
  if (inspect.pageCount < 1) reasons.push("pdf_no_pages");

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    mode: "parallel_source_pdf",
    excelSheetCount: sheets.length,
    pdfPageCount: inspect.pageCount,
  };
}
