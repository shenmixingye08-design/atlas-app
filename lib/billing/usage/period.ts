/**
 * Billing usage period — calendar month in the product timezone.
 * Source of Truth: Asia/Tokyo (same as automation scheduler default).
 * Not subscription-anniversary based.
 */

export const USAGE_PERIOD_TIMEZONE = "Asia/Tokyo";

function tokyoParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: USAGE_PERIOD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

export function getUsageMonthKey(now: Date = new Date()): string {
  const { year, month } = tokyoParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getUsageDayKey(now: Date = new Date()): string {
  const { year, month, day } = tokyoParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** First instant of the next Tokyo calendar month (ISO). */
export function nextUsageResetAtFromMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  if (!year || !month) {
    const { year: y, month: m } = tokyoParts(new Date());
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`;
}
