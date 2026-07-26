import "server-only";

import { detectDeliverableFormats } from "./detect-formats";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { resolveGenerationFormats } from "./resolve-formats";
import {
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "./store";
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
 * Future: call `dispatchDeliverablesToIntegrations()` from
 * `@/lib/integrations/deliverable-bridge` when delivery rules are configured.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: { userId: string },
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();

  if (!content) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
    };
  }

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  const detection = resolveGenerationFormats(
    input.assignment,
    input.formats,
    content,
  );
  const formats = detection.formats;
  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  // Normalize once so all formats share the same structured source.
  const { normalizeToStructuredDocument, structuredDocumentToMarkdown } =
    await import("@/lib/deliverables/document");
  const normalized = normalizeToStructuredDocument(content, {
    titleHint: baseFileName,
  });
  const canonicalSource = structuredDocumentToMarkdown(normalized.document);

  const deliverables: Deliverable[] = [];

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    try {
      const file = await generator.generate(canonicalSource, baseFileName);
      const stored = await saveDeliverableFileDurable(file, options.userId, {
        sourceContent: canonicalSource,
        baseFileName,
      });
      deliverables.push(toDeliverableMetadata(stored, requestOrigin));
    } catch (error) {
      console.error(
        `[generateDeliverables] ${format} failed — skipping broken file`,
        error,
      );
      // Markdown should still succeed for the user when Word/PDF fail.
      if (format === "md") {
        throw error;
      }
    }
  }

  return {
    deliverables,
    detection,
  };
}
