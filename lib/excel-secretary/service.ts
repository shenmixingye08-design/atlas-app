import "server-only";

import { analyzeWorkbookModel } from "./analyze-workbook";
import { toPreviewPayload, writeWorkbookBuffer } from "./build-workbook";
import { detectExcelIntent } from "./detect-intent";
import { applyExcelEdits } from "./edit-workbook";
import {
  exportWorkbook,
  workbookModelFromXlsxBuffer,
  type ExcelExportFormat,
} from "./export";
import {
  workbookFromCsvBuffer,
  workbookFromDocxBuffer,
  workbookFromPdfBuffer,
} from "./from-documents";
import {
  workbookFromCsv,
  workbookFromMarkdownTables,
  workbookFromMatrix,
} from "./from-tabular";
import { validateExcelWorkbookModel } from "./schema";
import { sanitizeExcelFileName } from "./security";
import { buildTemplateWorkbook } from "./templates";
import type {
  ExcelAnalysisResult,
  ExcelEditOperation,
  ExcelSecretaryResult,
  ExcelStageError,
  ExcelWorkbookModel,
} from "./types";

function fail(
  stage: ExcelStageError["stage"],
  code: string,
  message: string,
  retriable = true,
): ExcelSecretaryResult {
  return {
    ok: false,
    workbook: null,
    buffer: null,
    fileName: "error.xlsx",
    errors: [{ stage, code, message, retriable }],
    warnings: [],
    preview: null,
  };
}

async function finalize(
  workbook: ExcelWorkbookModel,
  warnings: string[] = [],
): Promise<ExcelSecretaryResult> {
  try {
    const enriched: ExcelWorkbookModel = {
      ...workbook,
      locale: workbook.locale ?? "ja-JP",
      purpose: workbook.purpose ?? workbook.title,
      warnings: [...(workbook.warnings ?? []), ...warnings],
    };

    // Highlight low-confidence OCR cells for human review.
    enriched.sheets = enriched.sheets.map((sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) =>
        row.map((cell) => {
          if (cell.needsReview || (cell.confidence != null && cell.confidence < 0.6)) {
            return {
              ...cell,
              fillArgb: cell.fillArgb ?? "FFFFF2CC",
              needsReview: true,
            };
          }
          return cell;
        }),
      ),
    }));

    const validation = validateExcelWorkbookModel(enriched);
    if (!validation.ok) {
      return fail(
        "formula",
        "formula_validation_failed",
        validation.errors.slice(0, 5).join(" / ") || "表設計の検証に失敗しました",
        true,
      );
    }

    const buffer = await writeWorkbookBuffer(enriched);
    const fileName = `${sanitizeExcelFileName(enriched.title)}.xlsx`;
    return {
      ok: true,
      workbook: enriched,
      buffer,
      fileName,
      errors: [],
      warnings: [
        ...warnings,
        ...validation.formulaIssues
          .filter((i) => i.code === "invalid_ref")
          .slice(0, 3)
          .map((i) => `${i.sheet}!${i.cell}: ${i.message}`),
      ],
      preview: toPreviewPayload(enriched),
    };
  } catch (error) {
    return fail(
      "excel_build",
      "excel_generation_failed",
      error instanceof Error ? error.message : "Excel生成に失敗しました",
    );
  }
}

/** Natural-language Excel creation (template + structure, AI content optional later). */
export async function createExcelFromAssignment(input: {
  assignment: string;
  /** Optional AI/markdown table content to override sample rows. */
  contentMarkdown?: string | null;
}): Promise<ExcelSecretaryResult> {
  try {
    const intent = detectExcelIntent(input.assignment);
    let workbook = buildTemplateWorkbook(intent.kind, intent.title);

    if (input.contentMarkdown?.trim()) {
      try {
        const fromMd = workbookFromMarkdownTables({
          markdown: input.contentMarkdown,
          title: intent.title,
          kind: intent.kind,
        });
        if (fromMd.sheets.some((s) => s.rows.length > 0)) {
          workbook = {
            ...fromMd,
            kind: intent.kind,
            title: intent.title,
          };
        }
      } catch {
        // keep template
      }
    }

    if (intent.wantsChart && !workbook.sheets.some((s) => (s.charts?.length ?? 0) > 0)) {
      workbook = {
        ...workbook,
        sheets: workbook.sheets.map((sheet, index) =>
          index === 0
            ? {
                ...sheet,
                charts: [
                  {
                    type: "column",
                    title: intent.title,
                    categoriesRange: "A3:A10",
                    series: [{ name: "値", valuesRange: "B3:B10" }],
                    anchor: "H2",
                  },
                ],
              }
            : sheet,
        ),
      };
    }

    return finalize(workbook);
  } catch (error) {
    return fail(
      "intent",
      "intent_failed",
      error instanceof Error ? error.message : "依頼の解釈に失敗しました",
    );
  }
}

/** Vision / structured tables → Excel (cell structure preserved). */
export async function createExcelFromVisionTables(input: {
  title?: string;
  tables: Array<{
    name?: string;
    headers: string[];
    rows: Array<Array<string | number | null>>;
  }>;
  kind?: ExcelWorkbookModel["kind"];
}): Promise<ExcelSecretaryResult> {
  try {
    if (!input.tables.length) {
      return fail("table_extract", "no_tables", "表データを取得できませんでした", false);
    }
    const sheets = input.tables.map((table, index) =>
      workbookFromMatrix({
        kind: input.kind ?? "from_image",
        title: input.title ?? table.name ?? `表${index + 1}`,
        sheetName: (table.name ?? `表${index + 1}`).slice(0, 31),
        headers: table.headers.map(String),
        rows: table.rows.map((row) =>
          row.map((cell) => (cell == null ? "" : String(cell))),
        ),
        includeTotal: true,
        withChart: index === 0,
      }),
    );
    const workbook: ExcelWorkbookModel = {
      kind: input.kind ?? "from_image",
      title: input.title ?? "画像から作成した表",
      sheets: sheets.flatMap((w) => w.sheets),
    };
    return finalize(workbook);
  } catch (error) {
    return fail(
      "image_analysis",
      "vision_excel_failed",
      error instanceof Error ? error.message : "画像からのExcel化に失敗しました",
    );
  }
}

export async function createExcelFromUpload(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  title?: string;
}): Promise<ExcelSecretaryResult> {
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = input.mimeType.toLowerCase();
  const title = input.title ?? input.fileName.replace(/\.[^.]+$/, "");

  try {
    if (mime.includes("csv") || ext === "csv") {
      return finalize(await workbookFromCsvBuffer({ buffer: input.buffer, title }));
    }
    if (mime.includes("pdf") || ext === "pdf") {
      return finalize(await workbookFromPdfBuffer({ buffer: input.buffer, title }));
    }
    if (
      mime.includes("wordprocessingml") ||
      ext === "docx" ||
      ext === "doc"
    ) {
      return finalize(await workbookFromDocxBuffer({ buffer: input.buffer, title }));
    }
    if (
      mime.includes("spreadsheetml") ||
      ext === "xlsx" ||
      ext === "xls"
    ) {
      const model = await workbookModelFromXlsxBuffer(input.buffer, title);
      return finalize(model, ext === "xls" ? ["旧.xls は読み取り限定対応です"] : []);
    }
    // Plain text / markdown fallback
    const text = input.buffer.toString("utf8");
    if (text.includes("|") || text.includes(",")) {
      if (text.includes(",")) {
        return finalize(workbookFromCsv({ csvText: text, title }));
      }
      return finalize(
        workbookFromMarkdownTables({ markdown: text, title, kind: "generic_table" }),
      );
    }
    return fail("table_extract", "unsupported_upload", "対応形式は CSV / PDF / Word / Excel です", false);
  } catch (error) {
    return fail(
      "table_extract",
      "upload_convert_failed",
      error instanceof Error ? error.message : "ファイル変換に失敗しました",
    );
  }
}

export async function editExcelBuffer(input: {
  buffer: Buffer;
  operations: ExcelEditOperation[];
  title?: string;
}): Promise<ExcelSecretaryResult> {
  try {
    const model = await workbookModelFromXlsxBuffer(
      input.buffer,
      input.title ?? "編集後Excel",
    );
    const edited = applyExcelEdits(model, input.operations);
    return finalize(edited);
  } catch (error) {
    return fail(
      "edit",
      "edit_failed",
      error instanceof Error ? error.message : "Excel編集に失敗しました",
    );
  }
}

export async function analyzeExcelBuffer(input: {
  buffer: Buffer;
  title?: string;
}): Promise<{ ok: true; analysis: ExcelAnalysisResult; preview: ReturnType<typeof toPreviewPayload> } | { ok: false; error: ExcelStageError }> {
  try {
    const model = await workbookModelFromXlsxBuffer(
      input.buffer,
      input.title ?? "分析対象",
    );
    return {
      ok: true,
      analysis: analyzeWorkbookModel(model),
      preview: toPreviewPayload(model),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        stage: "analyze",
        code: "analyze_failed",
        message:
          error instanceof Error ? error.message : "Excel分析に失敗しました",
        retriable: true,
      },
    };
  }
}

export async function convertExcelExport(input: {
  buffer: Buffer;
  format: ExcelExportFormat;
  title?: string;
}): Promise<ExcelSecretaryResult & { exportMimeType?: string }> {
  try {
    const model = await workbookModelFromXlsxBuffer(
      input.buffer,
      input.title ?? "export",
    );
    const exported = await exportWorkbook(model, input.format);
    return {
      ok: true,
      workbook: model,
      buffer: exported.buffer,
      fileName: exported.fileName,
      errors: [],
      warnings: exported.warning ? [exported.warning] : [],
      preview: toPreviewPayload(model),
      exportMimeType: exported.mimeType,
    };
  } catch (error) {
    return fail(
      "download",
      "export_failed",
      error instanceof Error ? error.message : "エクスポートに失敗しました",
    );
  }
}
