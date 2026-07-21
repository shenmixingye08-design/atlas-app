"use client";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import type { WorkProgressStageView } from "@/lib/work-progress/stages";

type WorkProgressTrackerProps = {
  stages: WorkProgressStageView[];
  etaLabel: string;
  assignment?: string;
  className?: string;
};

export function WorkProgressTracker({
  stages,
  etaLabel,
  assignment,
  className,
}: WorkProgressTrackerProps) {
  const current = stages.find((stage) => stage.status === "current");

  return (
    <section
      aria-label={ui.workProgress.trackerLabel}
      className={cn("space-y-5", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.workProgress.progressHeading}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {current?.label ?? ui.workProgress.delivered}
          </p>
          {assignment ? (
            <p className="mt-1 line-clamp-2 text-sm text-[var(--foreground-muted)]">
              {assignment}
            </p>
          ) : null}
        </div>
        <div className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-foreground">
          {ui.workProgress.etaPrefix}
          {etaLabel}
        </div>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className={cn(
              "rounded-[18px] border px-4 py-3 text-sm transition-colors",
              stage.status === "current" &&
                "border-accent/40 bg-accent/10 font-semibold text-foreground",
              stage.status === "done" &&
                "border-[var(--border-subtle)] bg-[var(--card)] text-foreground",
              stage.status === "upcoming" &&
                "border-transparent bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
              stage.status === "failed" &&
                "border-red-400/40 bg-red-500/10 font-semibold text-foreground",
            )}
          >
            <span className="mr-2 inline-block w-4 text-center" aria-hidden>
              {stage.status === "done"
                ? "✓"
                : stage.status === "current"
                  ? "●"
                  : stage.status === "failed"
                    ? "!"
                    : "○"}
            </span>
            {stage.label}
            {stage.status === "current" ? (
              <span className="ml-2 text-xs font-normal text-accent">
                {ui.workProgress.currentBadge}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
