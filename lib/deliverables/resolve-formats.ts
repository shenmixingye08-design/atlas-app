import { enrichFormatsFromContent } from "./content-formats";
import { detectDeliverableFormats } from "./detect-formats";
import type { DeliverableFormat, DeliverableFormatDetection } from "./types";

/** Resolve which formats to generate — user override or assignment + content detection. */
export function resolveGenerationFormats(
  assignment: string,
  override?: DeliverableFormat[],
  content?: string,
): DeliverableFormatDetection {
  if (override && override.length > 0) {
    return { formats: override, matchedRule: "user_selected_formats" };
  }

  const detection = detectDeliverableFormats(assignment);
  if (!content?.trim()) {
    return detection;
  }

  return {
    formats: enrichFormatsFromContent(detection.formats, content, assignment),
    matchedRule: detection.matchedRule
      ? `${detection.matchedRule}+content`
      : "content_enriched",
  };
}
