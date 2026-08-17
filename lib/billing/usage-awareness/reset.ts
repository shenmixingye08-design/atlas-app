import { USAGE_PERIOD_TIMEZONE } from "@/lib/billing/usage/period";

/** Next calendar-month reset from a JST `YYYY-MM` usage month key. */
export function nextUsageResetDate(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  if (!year || !month) {
    const now = new Date();
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: USAGE_PERIOD_TIMEZONE,
      year: "numeric",
      month: "2-digit",
    }).format(now);
    return nextUsageResetDate(key);
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  // 00:00 Asia/Tokyo = 15:00 UTC previous calendar day
  return new Date(Date.UTC(nextYear, nextMonth - 1, 1) - 9 * 60 * 60 * 1000);
}

export function nextUsageResetAt(monthKey: string): string {
  return nextUsageResetDate(monthKey).toISOString();
}

/** Example: 「9月1日にリセットされます」 — always JST calendar, not server local. */
export function formatUsageResetLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  if (!year || !month) {
    const reset = nextUsageResetDate(monthKey);
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: USAGE_PERIOD_TIMEZONE,
      month: "numeric",
      day: "numeric",
    }).formatToParts(reset);
    const m = parts.find((part) => part.type === "month")?.value ?? "1";
    const d = parts.find((part) => part.type === "day")?.value ?? "1";
    return `${m}月${d}日にリセットされます`;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextMonth}月1日にリセットされます`;
}
