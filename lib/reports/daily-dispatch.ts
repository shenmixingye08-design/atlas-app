import "server-only";

import { listSupabaseUserIdsForDomain } from "@/lib/persistence/supabase-user-state";
import { NOTIFICATIONS_DOMAIN_KEY } from "@/lib/notifications/durable";
import { createNotification } from "@/lib/notifications/service";
import { listUserNotifications } from "@/lib/notifications/service";
import {
  aggregateDailyReport,
  formatDailyReportPushBody,
  formatDailyReportTitle,
} from "@/lib/reports/daily-aggregation";

/** Send programmatic daily report push + in-app record (no AI). */
export async function dispatchDailyReportsForDueUsers(): Promise<
  Array<{ userId: string; sent: boolean }>
> {
  const userIds = await listSupabaseUserIdsForDomain(NOTIFICATIONS_DOMAIN_KEY);
  const results: Array<{ userId: string; sent: boolean }> = [];

  for (const userId of userIds.slice(0, 200)) {
    const notifications = listUserNotifications(userId);
    const section = aggregateDailyReport({ notifications });
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
