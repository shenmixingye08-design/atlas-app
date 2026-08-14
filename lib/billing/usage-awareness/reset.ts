/** Next calendar-month reset from a `YYYY-MM` usage month key. */
export function nextUsageResetDate(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  if (!year || !month) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  return new Date(year, month, 1);
}

export function nextUsageResetAt(monthKey: string): string {
  return nextUsageResetDate(monthKey).toISOString();
}

/** Example: 「9月1日にリセットされます」 */
export function formatUsageResetLabel(monthKey: string): string {
  const reset = nextUsageResetDate(monthKey);
  return `${reset.getMonth() + 1}月${reset.getDate()}日にリセットされます`;
}
