import "server-only";

import { extractExcelSheets } from "@/lib/deliverables/excel-data";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { hasPkHeader } from "@/lib/deliverables/integrity";

export type ExcelPdfParityResult = {
  ok: boolean;
  reasons: string[];
  /** Approximate: PDF generated from same source (not LibreOffice binary convert) */
  mode: "parallel_source_pdf";
  excelSheetCount: number;
  pdfBytes: number;
  xlsxBytes: number;
};

/**
 * Excel→PDF parity (CI-safe approximation).
 * Generates PDF from the same source content and verifies both binaries are valid.
 * True Excel application print-to-PDF is not available in this environment.
 */
export async function verifyExcelPdfParity(input: {
  content: string;
  xlsxBuffer: Buffer;
}): Promise<ExcelPdfParityResult> {
  const reasons: string[] = [];
  const sheets = extractExcelSheets(input.content);
  if (sheets.length === 0) {
    return {
      ok: false,
      reasons: ["no_sheets"],
      mode: "parallel_source_pdf",
      excelSheetCount: 0,
      pdfBytes: 0,
      xlsxBytes: input.xlsxBuffer.byteLength,
    };
  }

  if (!hasPkHeader(input.xlsxBuffer)) reasons.push("xlsx_invalid");
  if (input.xlsxBuffer.byteLength < 1_500) reasons.push("xlsx_too_small");

  const pdf = await new PdfDeliverableGenerator().generate(
    input.content,
    "excel-parity",
  );
  if (!pdf.buffer.subarray(0, 4).toString("utf8").startsWith("%PDF")) {
    reasons.push("invalid_pdf");
  }
  if (pdf.buffer.byteLength < 800) reasons.push("pdf_too_small");

  // Structural parity: same source tables should produce non-empty multi-cell content
  const cellCount = sheets.reduce(
    (sum, sheet) => sum + sheet.headers.length + sheet.rows.length * sheet.headers.length,
    0,
  );
  if (cellCount < 2) reasons.push("insufficient_cells");

  return {
    ok: reasons.length === 0,
    reasons,
    mode: "parallel_source_pdf",
    excelSheetCount: sheets.length,
    pdfBytes: pdf.buffer.byteLength,
    xlsxBytes: input.xlsxBuffer.byteLength,
  };
}
