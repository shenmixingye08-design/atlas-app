/**
 * Honest time-saved messaging for product clarity.
 *
 * Rules:
 * - Never invent completion duration — only measured values.
 * - "削減" is shown only when a declared typical manual baseline exists
 *   and measured duration is shorter. Labeled as 手作業の目安.
 */

export type TypicalManualMinutes = number;

export type TimeSavedBreakdown = {
  /** Measured MINERVOT completion seconds (always real when present). */
  measuredSec: number;
  /** Declared typical manual minutes for this job kind, or null. */
  typicalManualMinutes: number | null;
  /** Saved minutes = typical - measured, floored at 0. Null if no baseline. */
  savedMinutes: number | null;
};

/** Conservative typical manual times (minutes) by first-experience task. */
export const FIRST_EXPERIENCE_TYPICAL_MANUAL_MINUTES: Record<string, number> = {
  sns: 15,
  blog: 45,
  sales_material: 60,
  email: 10,
  files: 20,
  ai_chat: 10,
};

/** Conservative typical manual times (minutes) by deliverable/result kind. */
export const RESULT_TYPICAL_MANUAL_MINUTES: Record<string, number> = {
  x_post: 15,
  email: 10,
  blog: 45,
  report: 60,
  proposal: 60,
  presentation: 90,
  research: 60,
  document: 30,
};

export function buildTimeSavedBreakdown(params: {
  measuredSec: number;
  typicalManualMinutes: number | null | undefined;
}): TimeSavedBreakdown {
  const measuredSec = Math.max(0, Math.round(params.measuredSec));
  const typical =
    typeof params.typicalManualMinutes === "number" &&
    Number.isFinite(params.typicalManualMinutes) &&
    params.typicalManualMinutes > 0
      ? Math.round(params.typicalManualMinutes)
      : null;

  if (typical == null) {
    return { measuredSec, typicalManualMinutes: null, savedMinutes: null };
  }

  const measuredMinutes = measuredSec / 60;
  const savedMinutes = Math.max(0, Math.round((typical - measuredMinutes) * 10) / 10);

  return {
    measuredSec,
    typicalManualMinutes: typical,
    savedMinutes,
  };
}

export function formatMeasuredDuration(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  if (safe < 60) return `${safe}秒`;
  const minutes = Math.floor(safe / 60);
  const rem = safe % 60;
  if (rem === 0) return `${minutes}分`;
  return `${minutes}分${rem}秒`;
}

export function formatSavedAmount(savedMinutes: number): string {
  const safe = Math.max(0, savedMinutes);
  if (safe >= 60) {
    const hours = Math.round((safe / 60) * 10) / 10;
    return `${hours}時間`;
  }
  if (Number.isInteger(safe)) return `${safe}分`;
  return `${safe}分`;
}
