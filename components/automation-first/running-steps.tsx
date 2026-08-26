"use client";

import Link from "next/link";

import { StatusMorph, type MotionJobStatus } from "@/components/motion/status-morph";
import type { HomeRunningJob } from "@/lib/automation-first/home-data";
import { cn } from "@/lib/design-system/cn";

function markerStatus(
  marker: HomeRunningJob["steps"][number]["marker"],
): { status: MotionJobStatus; label: string } {
  switch (marker) {
    case "done":
      return { status: "completed", label: "完了" };
    case "active":
      return { status: "running", label: "実行中" };
    case "failed":
      return { status: "failed", label: "失敗" };
    case "retrying":
      return { status: "needs_attention", label: "再試行中" };
    default:
      return { status: "queued", label: "待機" };
  }
}

export function RunningStepsPanel({
  jobs,
  onOpen,
  heading = "h2",
}: {
  jobs: HomeRunningJob[];
  onOpen?: (id: string) => void;
  heading?: "h2" | "h3";
}) {
  if (jobs.length === 0) return null;

  const Heading = heading;

  return (
    <section aria-labelledby="af-running-heading" className="space-y-3">
      <div>
        <Heading
          id="af-running-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          実行中の仕事
        </Heading>
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          根拠のない進捗率は表示しません。各手順の状態だけを示します。
        </p>
      </div>
      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--status-running)_35%,var(--border))] bg-[var(--status-running-bg)] p-4"
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
                  <StatusMorph
                    status={markerStatus(step.marker).status}
                    label={markerStatus(step.marker).label}
                  />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
