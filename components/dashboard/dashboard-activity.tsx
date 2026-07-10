import type { ActivityEvent } from "@/lib/dashboard/types";
import { ui } from "@/lib/i18n";
import { formatRelativeDate } from "@/lib/projects/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type DashboardActivityProps = {
  events: ActivityEvent[];
};

export function DashboardActivity({ events }: DashboardActivityProps) {
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-title text-foreground">
        {ui.dashboard.recentActivity}
      </h2>
      <Card variant="elevated" padding="none" className="mt-5 overflow-hidden">
        {events.length === 0 ? (
          <EmptyState
            icon="📋"
            title={ui.dashboard.noActivity}
            description={ui.dashboard.noActivityHint}
          />
        ) : (
          <ol className="relative px-5 py-4 sm:px-6">
            <div
              className="absolute left-[2.15rem] top-6 bottom-6 w-px bg-[var(--border)] sm:left-[2.4rem]"
              aria-hidden="true"
            />
            {events.map((event, index) => (
              <li
                key={event.id}
                className="relative flex gap-4 pb-5 last:pb-0 animate-fade-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--background-subtle)] text-sm ring-1 ring-[var(--border)]">
                  {event.icon}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {event.title}
                  </p>
                  {event.description && (
                    <p className="mt-0.5 truncate text-caption">
                      {event.description}
                    </p>
                  )}
                  <time
                    className="mt-1 block text-caption tabular-nums"
                    dateTime={event.timestamp}
                  >
                    {formatRelativeDate(event.timestamp)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
