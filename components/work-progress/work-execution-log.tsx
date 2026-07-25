"use client";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import {
  formatLogClock,
  type WorkActionLogEntry,
} from "@/lib/work-progress/action-logs";

type WorkExecutionLogProps = {
  logs: Array<Pick<WorkActionLogEntry, "id" | "at" | "message" | "level"> | {
    id: string;
    at: string;
    message: string;
    level?: "info" | "warn" | "error";
  }>;
  className?: string;
  compact?: boolean;
};

export function WorkExecutionLog({
  logs,
  className,
  compact = false,
}: WorkExecutionLogProps) {
  const ordered = [...logs].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  return (
    <section
      aria-label={ui.workProgress.logHeading}
      className={cn(
        "rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-sm)]",
        compact ? "px-4 py-4" : "px-5 py-5 sm:px-6 sm:py-6",
        className,
      )}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          {ui.workProgress.logHeading}
        </h3>
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.workProgress.logSubtitle}
        </p>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.workProgress.logEmpty}
        </p>
      ) : (
        <ol className="space-y-3">
          {ordered.map((entry) => (
            <li key={entry.id} className="flex gap-4 text-sm">
              <time
                dateTime={entry.at}
                className="w-12 shrink-0 font-medium tabular-nums text-[var(--foreground-muted)]"
              >
                {formatLogClock(entry.at)}
              </time>
              <span
                className={cn(
                  "leading-relaxed text-foreground",
                  entry.level === "error" && "text-red-600 dark:text-red-300",
                  entry.level === "warn" && "text-amber-700 dark:text-amber-200",
                )}
              >
                {entry.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
