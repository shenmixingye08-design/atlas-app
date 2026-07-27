import { detectDeliverableFormats } from "./detect-formats";
import {
  assignmentIsImageToExcel,
  shouldGenerateXlsx,
} from "./excel-data";
import type { DeliverableFormat, DeliverableFormatDetection } from "./types";
import { isExplicitWordRequest } from "./word-intent";

function withXlsx(
  formats: readonly DeliverableFormat[],
): DeliverableFormat[] {
  if (formats.includes("xlsx")) return [...formats];
  return ["xlsx", ...formats];
}

function withDocx(
  formats: readonly DeliverableFormat[],
): DeliverableFormat[] {
  if (formats.includes("docx")) return [...formats];
  return [...formats, "docx"];
}

/** Resolve which formats to generate — user override or assignment detection. */
export function resolveGenerationFormats(
  assignment: string,
  override?: DeliverableFormat[],
  content?: string,
): DeliverableFormatDetection {
  const detection = detectDeliverableFormats(assignment);
  const explicitWord = isExplicitWordRequest(assignment);

  if (override && override.length > 0) {
    let formats = [...override];
    // Explicit Word in the assignment must still produce docx even if the UI
    // override omitted it (e.g. stale auto-detect client state).
    if (explicitWord) {
      formats = withDocx(formats);
    }
    // Image → Excel must still expose .xlsx even when a wizard overrides formats.
    if (
      assignmentIsImageToExcel(assignment) ||
      (content ? shouldGenerateXlsx(assignment, content) : false)
    ) {
      return {
        formats: withXlsx(formats),
        matchedRule: explicitWord
          ? "user_selected_formats+word+xlsx"
          : "user_selected_formats+xlsx",
      };
    }
    return {
      formats,
      matchedRule: explicitWord
        ? "user_selected_formats+word"
        : "user_selected_formats",
    };
  }

  if (content && shouldGenerateXlsx(assignment, content)) {
    return {
      formats: withXlsx(detection.formats),
      matchedRule: detection.matchedRule ?? "table_or_excel_request",
    };
  }

  return detection;
}
