import "server-only";

import {
  generateCsvFromImageAnalysis,
  generateXlsxFromImageAnalysis,
} from "./generators";
import { detectDeliverableFormats } from "./detect-formats";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { resolveGenerationFormats } from "./resolve-formats";
import { saveDeliverableFile, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  GenerateDeliverablesInput,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
};

/**
 * Deliverables Engine — runs after orchestration completes.
 * Converts the final deliverable text into downloadable files server-side.
 *
 * When `imageAnalysis` is present, Excel/CSV are generated from structured JSON
 * (never by renaming Markdown).
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();
  const analysis = input.imageAnalysis ?? null;

  if (!content && !analysis) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
    };
  }

  const detection = resolveGenerationFormats(input.assignment, input.formats);
  let formats = detection.formats;

  if (analysis) {
    const preferred = new Set<string>(formats);
    preferred.add("xlsx");
    preferred.add("csv");
    if (analysis.documentType === "handwritten") {
      preferred.add("docx");
      preferred.add("pdf");
      preferred.add("md");
    }
    formats = [
      "xlsx",
      "csv",
      "pdf",
      "docx",
      "md",
      "txt",
      "pptx",
    ].filter((format) => preferred.has(format)) as typeof formats;
  }

  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  const deliverables: Deliverable[] = [];

  for (const format of formats) {
    try {
      if (analysis && format === "xlsx") {
        const file = await generateXlsxFromImageAnalysis(analysis, baseFileName);
        const stored = saveDeliverableFile(file);
        deliverables.push(toDeliverableMetadata(stored, requestOrigin));
        continue;
      }
      if (analysis && format === "csv") {
        const file = await generateCsvFromImageAnalysis(analysis, baseFileName);
        const stored = saveDeliverableFile(file);
        deliverables.push(toDeliverableMetadata(stored, requestOrigin));
        continue;
      }

      if (!content) continue;
      const generator = getDeliverableGenerator(format);
      if (!generator) continue;

      const file = await generator.generate(content, baseFileName);
      const stored = saveDeliverableFile(file);
      deliverables.push(toDeliverableMetadata(stored, requestOrigin));
    } catch (error) {
      console.error("[deliverables] generate failed", {
        format,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    deliverables,
    detection,
  };
}
