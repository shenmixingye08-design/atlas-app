import "server-only";

import { buildDeliverableContentHash } from "./content-hash";
import { detectDeliverableFormats } from "./detect-formats";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { resolveGenerationFormats } from "./resolve-formats";
import {
  getStoredDeliverableByHash,
  saveDeliverableFile,
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
 * No LLM calls — deterministic template conversion only.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();

  if (!content) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
    };
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

  const deliverables: Deliverable[] = [];

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    const contentHash = buildDeliverableContentHash(
      content,
      format,
      baseFileName,
    );
    const cached = getStoredDeliverableByHash(contentHash);
    if (cached) {
      deliverables.push(toDeliverableMetadata(cached, requestOrigin));
      continue;
    }

    const file = await generator.generate(content, baseFileName);
    const stored = saveDeliverableFile(file, contentHash);
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  return {
    deliverables,
    detection,
  };
}
