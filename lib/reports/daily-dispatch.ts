import "server-only";

import { listSupabaseUserIdsForDomain } from "@/lib/persistence/supabase-user-state";
import { NOTIFICATIONS_DOMAIN_KEY } from "@/lib/notifications/durable";
import { createNotification, listUserNotifications } from "@/lib/notifications/service";
import {
  aggregateDailyReport,
  formatDailyReportPushBody,
  formatDailyReportTitle,
} from "@/lib/reports/daily-aggregation";

const DEFAULT_REPORT_TIMEZONE = "Asia/Tokyo";
const DAILY_REPORT_HOUR = 19;

function localHour(now: Date, timezone: string): number {
  return Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(now),
    10,
  );
}

function localDateKey(now: Date, timezone: string): string {
  return now.toLocaleDateString("ja-JP", { timeZone: timezone });
}

function alreadySentDailyReportToday(
  notifications: ReturnType<typeof listUserNotifications>,
  dateKey: string,
): boolean {
  return notifications.some(
    (n) =>
      n.eventCategory === "daily_report" &&
      localDateKey(new Date(n.createdAt), DEFAULT_REPORT_TIMEZONE) === dateKey,
  );
}

/** Send programmatic daily report push + in-app record (no AI) at 19:00 user TZ. */
export async function dispatchDailyReportsForDueUsers(
  now = new Date(),
): Promise<Array<{ userId: string; sent: boolean }>> {
  const userIds = await listSupabaseUserIdsForDomain(NOTIFICATIONS_DOMAIN_KEY);
  const results: Array<{ userId: string; sent: boolean }> = [];
  const dateKey = localDateKey(now, DEFAULT_REPORT_TIMEZONE);

  if (localHour(now, DEFAULT_REPORT_TIMEZONE) !== DAILY_REPORT_HOUR) {
    return userIds.slice(0, 200).map((userId) => ({ userId, sent: false }));
  }

  for (const userId of userIds.slice(0, 200)) {
    const notifications = listUserNotifications(userId);
    if (alreadySentDailyReportToday(notifications, dateKey)) {
      results.push({ userId, sent: false });
      continue;
    }

    const section = aggregateDailyReport({ notifications, dateKey });
    if (section.highlights.length === 0) {
      results.push({ userId, sent: false });
      continue;
    }

    const record = createNotification({
      audience: "user",
      userId,
      type: "recommendation",
      title: formatDailyReportTitle(),
      message: formatDailyReportPushBody(section),
      actionUrl: "/reports/daily",
      eventCategory: "daily_report",
      severity: "summary",
    });

    results.push({ userId, sent: Boolean(record) });
  }

  return results;
}
