import {
  addDays,
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
  zonedTimeToUtc,
} from "@/lib/automations/schedule";

export type OneShotXSchedule = {
  scheduledFor: string;
  timezone: string;
  hour: number;
  minute: number;
};

/**
 * One-shot future X post from NL such as 「明日の12時に投稿して」.
 * Recurring phrases are handled by detectRecurringIntent — this is not that path.
 */
export function detectOneShotXSchedule(
  assignment: string,
  now: Date = new Date(),
): OneShotXSchedule | null {
  const text = assignment.trim();
  if (!text) return null;
  if (!/明日|あした/.test(text)) return null;
  if (!/投稿|ポスト|つぶや|ツイート|tweet|post|xへ|xに/i.test(text)) {
    return null;
  }

  const match = text.match(/(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/);
  if (!match) return null;

  const hour = Math.min(23, Math.max(0, Number.parseInt(match[1]!, 10)));
  const minute = match[2]
    ? Math.min(59, Math.max(0, Number.parseInt(match[2], 10)))
    : 0;
  const timezone = DEFAULT_AUTOMATION_TIMEZONE;
  const parts = getZonedParts(now, timezone);
  const tomorrow = addDays(parts.year, parts.month, parts.day, 1);
  const utc = zonedTimeToUtc(
    tomorrow.year,
    tomorrow.month,
    tomorrow.day,
    hour,
    minute,
    timezone,
  );

  if (utc.getTime() <= now.getTime()) return null;

  return {
    scheduledFor: utc.toISOString(),
    timezone,
    hour,
    minute,
  };
}
