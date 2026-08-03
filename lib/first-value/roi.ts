/**
 * ROI display helpers — estimate vs measured must stay distinct (ATLAS_RULES §15).
 */

export type RoiBasis = "estimated" | "measured";

export type RoiSlice = {
  label: string;
  minutes: number | null;
  basis: RoiBasis;
};

export type FirstValueRoiView = {
  today: RoiSlice;
  week: RoiSlice;
  month: RoiSlice;
  automationSuccessRate: number | null;
  memoryApplyRate: number | null;
  /** True when any measured minutes exist. */
  hasMeasured: boolean;
};

export type RoiInput = {
  /** Measured minutes from completed first-value / runs (null if unknown). */
  measuredTodayMinutes: number | null;
  measuredWeekMinutes: number | null;
  measuredMonthMinutes: number | null;
  /** Fallback estimates — never labeled as measured. */
  estimatedTodayMinutes: number | null;
  estimatedWeekMinutes: number | null;
  estimatedMonthMinutes: number | null;
  automationSuccessRate: number | null;
  memoryApplyRate: number | null;
};

function pick(
  label: string,
  measured: number | null,
  estimated: number | null,
): RoiSlice {
  if (measured != null && measured > 0) {
    return { label, minutes: measured, basis: "measured" };
  }
  if (estimated != null && estimated > 0) {
    return { label, minutes: estimated, basis: "estimated" };
  }
  return { label, minutes: null, basis: "estimated" };
}

export function buildFirstValueRoi(input: RoiInput): FirstValueRoiView {
  const today = pick("今日削減時間", input.measuredTodayMinutes, input.estimatedTodayMinutes);
  const week = pick("今週削減", input.measuredWeekMinutes, input.estimatedWeekMinutes);
  const month = pick("今月削減", input.measuredMonthMinutes, input.estimatedMonthMinutes);
  return {
    today,
    week,
    month,
    automationSuccessRate: input.automationSuccessRate,
    memoryApplyRate: input.memoryApplyRate,
    hasMeasured:
      today.basis === "measured" ||
      week.basis === "measured" ||
      month.basis === "measured",
  };
}

export function formatRoiMinutes(slice: RoiSlice): string {
  if (slice.minutes == null) return "—";
  if (slice.minutes < 60) return `${Math.round(slice.minutes)}分`;
  const hours = slice.minutes / 60;
  return `${hours.toFixed(1)}時間`;
}

export function formatRoiBasis(basis: RoiBasis): string {
  return basis === "measured" ? "実測" : "推定";
}
