import { auth } from "@clerk/nextjs/server";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { listUserNotifications } from "@/lib/notifications/service";
import {
  aggregateDailyReport,
  formatDailyReportPushBody,
  formatDailyReportTitle,
} from "@/lib/reports/daily-aggregation";
import { ui } from "@/lib/i18n";

export default async function DailyReportPage() {
  const { userId } = await auth();
  const notifications = userId ? listUserNotifications(userId) : [];
  const report = aggregateDailyReport({ notifications });

  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-6 animate-fade-up">
        <header className="space-y-2">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{formatDailyReportTitle()}</h1>
          <p className="text-body text-[var(--foreground-muted)]">
            {formatDailyReportPushBody(report)}
          </p>
        </header>
        <ul className="space-y-2 text-sm">
          {report.highlights.map((line) => (
            <li
              key={line}
              className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </AtlasAppShell>
  );
}
