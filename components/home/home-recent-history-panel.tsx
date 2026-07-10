"use client";

import Link from "next/link";

import { ActivityHistoryCard } from "@/components/activity-history/activity-history-card";
import { LoadingState } from "@/components/ui/loading-state";
import { useActivityHistory } from "@/lib/activity-history/use-activity-history";
import { ui } from "@/lib/i18n";

export function HomeRecentHistoryPanel() {
  const { recentItems, isReady } = useActivityHistory();

  if (!isReady) {
    return <LoadingState message={ui.activityHistory.loading} />;
  }

  if (recentItems.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title text-foreground">{ui.activityHistory.recentTitle}</h2>
        <Link href="/history" className="text-sm text-[var(--accent)] hover:underline">
          {ui.activityHistory.viewAll}
        </Link>
      </div>
      <div className="space-y-3">
        {recentItems.map((item) => (
          <Link
            key={item.id}
            href={`/history?item=${encodeURIComponent(item.id)}`}
            className="block transition-opacity hover:opacity-90"
          >
            <ActivityHistoryCard item={item} variant="static" />
          </Link>
        ))}
      </div>
    </section>
  );
}
