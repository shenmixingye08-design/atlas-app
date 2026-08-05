import "server-only";

import { resolveGenerationFormats } from "./resolve-formats";
import type { DeliverableFormat } from "./types";

const VALID: ReadonlySet<string> = new Set([
  "pdf",
  "docx",
  "pptx",
  "md",
  "txt",
  "xlsx",
]);

function normalizePreferred(
  value: unknown,
): DeliverableFormat | "auto" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (normalized === "word" || normalized === "doc") return "docx";
  if (VALID.has(normalized)) return normalized as DeliverableFormat;
  return null;
}

/**
 * P0-7: Single format resolver for Home / お願い / commander / generate API.
 * preferredDeliverableFormat wins; otherwise assignment detection (same as client).
 */
export function resolveRequestedExportFormats(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  content?: string;
  overrideFormats?: DeliverableFormat[];
}): {
  formats: DeliverableFormat[];
  matchedRule: string | null;
  required: boolean;
} {
  if (input.overrideFormats && input.overrideFormats.length > 0) {
    const detection = resolveGenerationFormats(
      input.assignment,
      input.overrideFormats,
      input.content,
    );
    return {
      formats: detection.formats,
      matchedRule: detection.matchedRule,
      required: detection.formats.length > 0,
    };
  }

  const preferred = normalizePreferred(
    input.metadata?.preferredDeliverableFormat,
  );
  if (preferred && preferred !== "auto") {
    const detection = resolveGenerationFormats(
      input.assignment,
      [preferred],
      input.content,
    );
    return {
      formats: detection.formats,
      matchedRule: detection.matchedRule ?? `preferred:${preferred}`,
      required: true,
    };
  }

  const preferredList = input.metadata?.preferredDeliverableFormats;
  if (Array.isArray(preferredList)) {
    const formats = preferredList.filter(
      (item): item is DeliverableFormat =>
        typeof item === "string" && VALID.has(item),
    );
    if (formats.length > 0) {
      const detection = resolveGenerationFormats(
        input.assignment,
        formats,
        input.content,
      );
      return {
        formats: detection.formats,
        matchedRule: detection.matchedRule ?? "preferred_list",
        required: true,
      };
    }
  }

  const detection = resolveGenerationFormats(
    input.assignment,
    undefined,
    input.content,
  );
  // Default md/txt/pdf (matchedRule null) are optional preview aids — not a
  // completion gate. Explicit preferred / keyword rules remain required so
  // Home and お願い share the same durable server pipeline.
  const required = Boolean(
    detection.matchedRule && !detection.matchedRule.endsWith(":default"),
  );
  return {
    formats: required ? detection.formats : [],
    matchedRule: detection.matchedRule,
    required,
  };
}
