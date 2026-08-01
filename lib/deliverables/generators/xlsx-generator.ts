import {
  createExcelFromAssignment,
  writeWorkbookBuffer,
  workbookFromMarkdownTables,
} from "@/lib/excel-secretary";
import { assignmentRequestsExcel, extractExcelSheets } from "../excel-data";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

/**
 * Excel (.xlsx) generator — delegates to Excel Secretary engine for
 * formulas / design / charts / table formatting when possible.
 * Keeps Deliverable engine contract unchanged.
 */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: Record<string, unknown>,
  ): Promise<GeneratedDeliverableFile> {
    const assignment =
      typeof options?.assignment === "string" && options.assignment.trim()
        ? options.assignment
        : baseFileName;

    // Prefer secretary path for NL excel / rich tables / known business sheets.
    if (
      assignmentRequestsExcel(assignment) ||
      assignmentRequestsExcel(content.slice(0, 400)) ||
      extractExcelSheets(content).length > 0
    ) {
      const result = await createExcelFromAssignment({
        assignment,
        contentMarkdown: content,
      });
      if (result.ok && result.buffer) {
        return createDeliverableFile("xlsx", baseFileName, result.buffer, false);
      }
    }

    // Structured fallback from markdown tables via secretary model.
    const model = workbookFromMarkdownTables({
      markdown: content,
      title: baseFileName,
      kind: "generic_table",
    });
    const buffer = await writeWorkbookBuffer(model);
    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}
