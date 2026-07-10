import { detectDeliverableFormats } from "./detect-formats";
import type { DeliverableFormat, DeliverableFormatDetection } from "./types";

/** Resolve which formats to generate — user override or assignment detection. */
export function resolveGenerationFormats(
  assignment: string,
  override?: DeliverableFormat[],
): DeliverableFormatDetection {
  const detection = detectDeliverableFormats(assignment);
  if (override && override.length > 0) {
    return { formats: override, matchedRule: "user_selected_formats" };
  }
  return detection;
}
