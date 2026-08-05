"use client";

import Link from "next/link";

import type { HomeRunningJob } from "@/lib/automation-first/home-data";
import { cn } from "@/lib/design-system/cn";

function markerLabel(marker: HomeRunningJob["steps"][number]["marker"]): string {
  switch (marker) {
    case "done":
      return "完了";
    case "active":
      return "実行中";
    case "failed":
      return "失敗";
    case "retrying":
      return "再試行中";
    default:
      return "待機";
  }
}

export function RunningStepsPanel({
  jobs,
  onOpen,
}: {
  jobs: HomeRunningJob[];
  onOpen?: (id: string) => void;
}) {
  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="af-running-heading" className="space-y-3">
      <div>
        <h2
          id="af-running-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          実行中の仕事
        </h2>
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          根拠のない進捗率は表示しません。各手順の状態だけを示します。
        </p>
      </div>
      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="af-card border-[color-mix(in_srgb,var(--status-running)_35%,var(--border))] bg-[var(--status-running-bg)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
                  {job.title}
                </p>
                {job.currentStepName ? (
                  <p className="mt-1 text-[length:var(--text-body)] text-[var(--status-running)]">
                    いま: {job.currentStepName}
                  </p>
                ) : null}
              </div>
              <Link
                href={job.href}
                onClick={() => onOpen?.(job.id)}
                className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
              >
                詳細
              </Link>
            </div>
            <ol className="mt-3 space-y-1.5">
              {job.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center justify-between gap-3 text-[length:var(--text-body)]"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      step.marker === "active"
                        ? "font-semibold text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    {step.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[length:var(--text-caption)]",
                      step.marker === "done" && "text-[var(--status-completed)]",
                      step.marker === "active" && "text-[var(--status-running)]",
                      step.marker === "failed" && "text-[var(--status-failed)]",
                      step.marker === "waiting" && "text-[var(--text-muted)]",
                      step.marker === "retrying" && "text-[var(--status-warning)]",
                    )}
                  >
                    {markerLabel(step.marker)}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
