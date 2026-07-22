import "server-only";

import { detectDeliverableFormats } from "./detect-formats";
import { buildExcelBaseName } from "./excel-intent";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { resolveGenerationFormats } from "./resolve-formats";
import { saveDeliverableFile, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  DeliverableFormat,
  GenerateDeliverablesInput,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
};

function baseNameForFormat(
  format: DeliverableFormat,
  assignment: string,
  title?: string,
): string {
  if (format === "xlsx") {
    return buildExcelBaseName(assignment, title);
  }
  return buildDeliverableBaseName(assignment, title);
}

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

  const deliverables: Deliverable[] = [];

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    const baseFileName = baseNameForFormat(
      format,
      input.assignment,
      input.title,
    );
    const file = await generator.generate(content, baseFileName);
    const stored = saveDeliverableFile(file);
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  return {
    deliverables,
    detection,
  };
}
