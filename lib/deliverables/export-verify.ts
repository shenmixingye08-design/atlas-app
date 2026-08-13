import "server-only";

import { verifyXlsxWorkbook } from "./excel-workbook/verify";
import { verifyPptxDeck } from "./pptx-storyboard/verify";
import { verifyPdfQuality } from "./pdf-quality";
import type { DeliverableFormat, GeneratedDeliverableFile } from "./types";

export type ExportVerifyResult = {
  ok: boolean;
  reasons: string[];
  pdf?: {
    pageCount: number;
    charCount: number;
    blankRatio: number;
    rasterizedPages: number;
  };
};

/**
 * Sync shape gates (ZIP/PDF magic, size, leakage).
 * PDF deep QA uses verifyGeneratedExportAsync.
 */
export function verifyGeneratedExport(
  file: GeneratedDeliverableFile,
): ExportVerifyResult {
  const reasons: string[] = [];
  const size = file.buffer.byteLength;
  const head = file.buffer.subarray(0, 8).toString("latin1");
  const asUtf8 = file.buffer.toString("utf8");

  if (size < 64) reasons.push("file_too_small");

  if (file.format === "docx" || file.format === "xlsx" || file.format === "pptx") {
    if (!head.startsWith("PK")) reasons.push("invalid_zip");
    if (size < 1_500) reasons.push("office_too_small");
  }

  if (file.format === "pdf") {
    if (!head.startsWith("%PDF")) reasons.push("invalid_pdf");
    if (size < 800) reasons.push("pdf_too_small");
    if (size < 8_000 && /[\u3040-\u9fff]/.test(file.fileName)) {
      reasons.push("pdf_suspiciously_small");
    }
  }

  if (file.format !== "pdf" && file.format !== "xlsx" && file.format !== "pptx") {
    for (const marker of [
      '"type":',
      '"content":',
      "```json",
      "[object Object]",
    ]) {
      if (asUtf8.includes(marker)) reasons.push(`forbidden:${marker}`);
    }
    if (
      (file.format === "md" || file.format === "txt") &&
      asUtf8.includes("\\n")
    ) {
      reasons.push("forbidden:\\n");
    }
    if (/\bundefined\b/.test(asUtf8)) {
      reasons.push("forbidden:undefined");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Full export verification including PDF extract / blank / rasterize.
 */
export async function verifyGeneratedExportAsync(
  file: GeneratedDeliverableFile,
): Promise<ExportVerifyResult> {
  const base = verifyGeneratedExport(file);
  if (file.format === "xlsx") {
    const xlsx = await verifyXlsxWorkbook(file.buffer);
    const mapped = xlsx.reasons.map((reason) => {
      if (reason === "invalid_zip" || reason === "xlsx_reopen_failed") {
        return `excel_corrupt:${reason}`;
      }
      if (reason === "no_worksheet" || reason === "empty_sheet") {
        return `excel_structure:${reason}`;
      }
      if (reason === "formula_injection" || reason === "broken_formula_ref") {
        return `excel_workbook:${reason}`;
      }
      return `excel_workbook:${reason}`;
    });
    const reasons = [...base.reasons, ...mapped];
    return { ok: reasons.length === 0, reasons };
  }
  if (file.format === "pptx") {
    const pptx = await verifyPptxDeck(file.buffer);
    const mapped = pptx.reasons.map((reason) => {
      if (reason === "invalid_zip" || reason === "pptx_reopen_failed") {
        return `pptx_corrupt:${reason}`;
      }
      return `pptx_verify:${reason}`;
    });
    const reasons = [...base.reasons, ...mapped];
    return { ok: reasons.length === 0, reasons };
  }
  if (file.format !== "pdf") return base;

  const pdf = await verifyPdfQuality(file);
  const reasons = [...base.reasons, ...pdf.reasons];
  return {
    ok: reasons.length === 0,
    reasons,
    pdf: {
      pageCount: pdf.pageCount,
      charCount: pdf.charCount,
      blankRatio: pdf.blankRatio,
      rasterizedPages: pdf.rasterizedPages,
    },
  };
}

export function metricKeyForFormat(
  format: DeliverableFormat,
): "export_pdf" | "export_word" | "export_excel" | "deliverable_generate" {
  if (format === "pdf") return "export_pdf";
  if (format === "docx") return "export_word";
  if (format === "xlsx") return "export_excel";
  return "deliverable_generate";
}
