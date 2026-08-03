import { PLAN_DEFINITIONS } from "@/lib/billing/plans/registry";

export type RoiBasis = "estimated" | "measured";

export type SecretaryRoiSummary = {
  planPriceJpy: number;
  /** Hours saved this month */
  monthHoursSaved: number;
  weekHoursSaved: number;
  todayHoursSaved: number;
  basis: RoiBasis;
  /** Yen value of time if hourly wage assumed; null when not shown */
  impliedHourlyValueJpy: number | null;
  /** planPrice / hours — cost per saved hour */
  costPerSavedHourJpy: number | null;
  label: string;
  detail: string;
};

const DEFAULT_HOURLY_YEN = 3_000;

function lightPlanPriceJpy(): number {
  return (
    PLAN_DEFINITIONS.find((plan) => plan.planId === "light")?.monthlyPriceJpy ??
    980
  );
}

/**
 * Build ROI for Light plan (¥980). Always distinguish estimated vs measured.
 */
export function buildSecretaryRoi(input: {
  todayMinutesSaved: number | null;
  weekMinutesSaved: number | null;
  monthMinutesSaved: number | null;
  measured?: boolean;
}): SecretaryRoiSummary {
  const planPriceJpy = lightPlanPriceJpy();
  const basis: RoiBasis = input.measured ? "measured" : "estimated";

  const todayHours =
    (input.todayMinutesSaved ?? estimateMinutesFromNull(input.todayMinutesSaved)) /
    60;
  const weekHours =
    (input.weekMinutesSaved ?? estimateMinutesFromNull(input.weekMinutesSaved)) /
    60;
  const monthMinutes =
    input.monthMinutesSaved ??
    (input.weekMinutesSaved != null
      ? input.weekMinutesSaved * 4
      : input.todayMinutesSaved != null
        ? input.todayMinutesSaved * 22
        : 0);
  const monthHours = monthMinutes / 60;

  const costPerSavedHourJpy =
    monthHours > 0 ? Math.round(planPriceJpy / monthHours) : null;
  const impliedHourlyValueJpy =
    monthHours > 0 ? Math.round(monthHours * DEFAULT_HOURLY_YEN) : null;

  const basisLabel = basis === "measured" ? "実測" : "推定";
  const label =
    monthHours > 0
      ? `${basisLabel}: 今月 約${formatHours(monthHours)} 削減（¥${planPriceJpy}/月）`
      : `${basisLabel}: まだ削減時間が記録されていません`;

  const detail =
    monthHours > 0
      ? costPerSavedHourJpy != null
        ? `¥${planPriceJpy} で 1時間あたり 約¥${costPerSavedHourJpy}。時給¥${DEFAULT_HOURLY_YEN}換算なら 約¥${impliedHourlyValueJpy?.toLocaleString("ja-JP")} 相当です。`
        : `月額 ¥${planPriceJpy} のプランで時間を生み出します。`
      : "最初の仕事を終えると、削減時間がここに表示されます。";

  return {
    planPriceJpy,
    monthHoursSaved: round1(monthHours),
    weekHoursSaved: round1(weekHours),
    todayHoursSaved: round1(todayHours),
    basis,
    impliedHourlyValueJpy,
    costPerSavedHourJpy,
    label,
    detail,
  };
}

function estimateMinutesFromNull(value: number | null): number {
  return value ?? 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}分`;
  return `${round1(hours)}時間`;
}

/**
 * Heuristic minutes saved from completed jobs when no measured timer exists.
 * Always mark as estimated at the call site.
 */
export function estimateSavedMinutesFromCompletions(completedJobs: number): number {
  if (completedJobs <= 0) return 0;
  // ~12 minutes of routine work avoided per completed automation/job
  return completedJobs * 12;
}
