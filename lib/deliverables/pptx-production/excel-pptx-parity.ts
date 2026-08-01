import "server-only";

import { extractExcelSheets } from "@/lib/deliverables/excel-data";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";

import { inspectPptxProduction } from "./pptx-inspect";

export type ExcelPptxParityResult = {
  ok: boolean;
  reasons: string[];
  mode: "table_to_slides";
  excelSheetCount: number;
  slideCount: number;
  chartCount: number;
  tableHintCount: number;
};

/**
 * Excel→PowerPoint parity from tabular markdown source.
 * Tables become slide tables; numeric columns become charts.
 */
export async function verifyExcelPptxParity(content: string): Promise<ExcelPptxParityResult> {
  const reasons: string[] = [];
  const sheets = extractExcelSheets(content);
  if (sheets.length === 0) {
    return {
      ok: false,
      reasons: ["no_sheets"],
      mode: "table_to_slides",
      excelSheetCount: 0,
      slideCount: 0,
      chartCount: 0,
      tableHintCount: 0,
    };
  }

  const file = await new PptxDeliverableGenerator().generate(
    content,
    "excel-pptx-parity",
  );
  const inspect = inspectPptxProduction(file.buffer);
  if (!inspect.ok) reasons.push(...inspect.reasons.map((r) => `pptx:${r}`));
  if (inspect.tableHintCount < 1 && sheets.some((s) => s.rows.length > 0)) {
    reasons.push("table_not_rendered");
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    mode: "table_to_slides",
    excelSheetCount: sheets.length,
    slideCount: inspect.slideCount,
    chartCount: inspect.chartCount,
    tableHintCount: inspect.tableHintCount,
  };
}
