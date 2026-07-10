import "server-only";

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
 * Future: call `dispatchDeliverablesToIntegrations()` from
 * `@/lib/integrations/deliverable-bridge` when delivery rules are configured.
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

  const detection = resolveGenerationFormats(input.assignment, input.formats);
  const formats = detection.formats;
  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  const deliverables: Deliverable[] = [];

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    const file = await generator.generate(content, baseFileName);
    const stored = saveDeliverableFile(file);
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  return {
    deliverables,
    detection,
  };
}
