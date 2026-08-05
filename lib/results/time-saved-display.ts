import {
  buildTimeSavedBreakdown,
  formatMeasuredDuration,
  formatSavedAmount,
  RESULT_TYPICAL_MANUAL_MINUTES,
  type TimeSavedBreakdown,
} from "@/lib/product-clarity/time-saved";
import type { Project } from "@/lib/projects/types";

import { deriveTargetType } from "./completion";

function resolveTypicalManualMinutes(project: Project): number | null {
  const type = project.result?.deliverable?.type;
  if (type && RESULT_TYPICAL_MANUAL_MINUTES[type] != null) {
    return RESULT_TYPICAL_MANUAL_MINUTES[type];
  }
  const target = deriveTargetType(project);
  return RESULT_TYPICAL_MANUAL_MINUTES[target] ?? null;
}

/**
 * Build honest completion-time messaging for a finished project.
 * Uses measured totalDurationMs only — never invents duration.
 */
export function buildProjectTimeSaved(project: Project): TimeSavedBreakdown | null {
  const measuredMs = project.result?.totalDurationMs;
  if (typeof measuredMs !== "number" || !Number.isFinite(measuredMs) || measuredMs <= 0) {
    return null;
  }

  return buildTimeSavedBreakdown({
    measuredSec: Math.max(1, Math.round(measuredMs / 1000)),
    typicalManualMinutes: resolveTypicalManualMinutes(project),
  });
}

export { formatMeasuredDuration, formatSavedAmount };
