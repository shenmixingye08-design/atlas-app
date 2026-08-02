"use client";

import { formatHoursMinutes } from "./format";
import { saveValueSavingsNotice } from "./store";
import { trackValueEvent } from "./analytics";

/**
 * Surface a savings notice on the home (not spammy system push).
 * Copy focuses on time saved — never AI jargon.
 */
export function notifyTodaySavings(minutesSaved: number): void {
  if (minutesSaved <= 0) return;
  const message = `今日は${formatHoursMinutes(minutesSaved)}節約しました`;
  saveValueSavingsNotice({
    at: new Date().toISOString(),
    minutesSaved,
    message,
  });
  trackValueEvent("value_roi_viewed", { minutesSaved, source: "savings_notice" });
}
