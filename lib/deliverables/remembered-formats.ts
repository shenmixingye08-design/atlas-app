/**
 * Apply last-used / saved office formats when the user does not restate them.
 * Explicit format keywords in this request always win.
 */

import { detectDeliverableFormats } from "./detect-formats";
import type { DeliverableFormat, DeliverableFormatDetection } from "./types";

const OFFICE: ReadonlySet<DeliverableFormat> = new Set([
  "docx",
  "xlsx",
  "pptx",
  "pdf",
]);

export function assignmentHasExplicitFormat(assignment: string): boolean {
  const detection = detectDeliverableFormats(assignment);
  return Boolean(
    detection.matchedRule && !detection.matchedRule.endsWith(":default"),
  );
}

export function normalizeRememberedFormats(
  raw: readonly unknown[] | null | undefined,
): DeliverableFormat[] {
  if (!raw) return [];
  const out: DeliverableFormat[] = [];
  for (const item of raw) {
    const value = String(item ?? "")
      .trim()
      .toLowerCase();
    const mapped: DeliverableFormat | null =
      value === "word" || value === "doc" || value === "docx"
        ? "docx"
        : value === "excel" || value === "xlsx"
          ? "xlsx"
          : value === "powerpoint" || value === "pptx" || value === "ppt"
            ? "pptx"
            : value === "pdf"
              ? "pdf"
              : null;
    if (mapped && OFFICE.has(mapped) && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export function applyRememberedDeliverableFormats(
  assignment: string,
  remembered: readonly DeliverableFormat[] | null | undefined,
): DeliverableFormatDetection {
  const detection = detectDeliverableFormats(assignment);
  if (assignmentHasExplicitFormat(assignment)) return detection;
  const formats = normalizeRememberedFormats(remembered ?? []);
  if (formats.length === 0) return detection;
  return {
    formats,
    matchedRule: "remembered_preference",
  };
}
