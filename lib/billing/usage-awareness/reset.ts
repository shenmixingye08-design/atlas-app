import { nextUsageResetAtFromMonthKey } from "@/lib/billing/usage/period";

/** Next calendar-month reset from a `YYYY-MM` usage month key (Asia/Tokyo). */
export function nextUsageResetDate(monthKey: string): Date {
  return new Date(nextUsageResetAtFromMonthKey(monthKey));
}

export function nextUsageResetAt(monthKey: string): string {
  return nextUsageResetAtFromMonthKey(monthKey);
}

/** Example: 「9月1日にリセットされます」 */
export function formatUsageResetLabel(monthKey: string): string {
  const reset = nextUsageResetDate(monthKey);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
  }).format(reset);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    day: "numeric",
  }).format(reset);
  return `${month}月${day}日にリセットされます`;
}
