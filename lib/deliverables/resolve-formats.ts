import { detectDeliverableFormats } from "./detect-formats";
import {
  assignmentIsImageToExcel,
  shouldGenerateXlsx,
} from "./excel-data";
import type { DeliverableFormat, DeliverableFormatDetection } from "./types";

function withXlsx(
  formats: readonly DeliverableFormat[],
): DeliverableFormat[] {
  if (formats.includes("xlsx")) return [...formats];
  return ["xlsx", ...formats];
}

/** Resolve which formats to generate — user override or assignment detection. */
export function resolveGenerationFormats(
  assignment: string,
  override?: DeliverableFormat[],
  content?: string,
): DeliverableFormatDetection {
  const detection = detectDeliverableFormats(assignment);

  if (override && override.length > 0) {
    // Image → Excel must still expose .xlsx even when a wizard overrides formats.
    if (
      assignmentIsImageToExcel(assignment) ||
      (content ? shouldGenerateXlsx(assignment, content) : false)
    ) {
      return {
        formats: withXlsx(override),
        matchedRule: "user_selected_formats+xlsx",
      };
    }
    return { formats: override, matchedRule: "user_selected_formats" };
  }

  if (content && shouldGenerateXlsx(assignment, content)) {
    return {
      formats: withXlsx(detection.formats),
      matchedRule: detection.matchedRule ?? "table_or_excel_request",
    };
  }

  return detection;
}
