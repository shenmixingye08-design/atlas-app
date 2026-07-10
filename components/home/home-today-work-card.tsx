"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { runAutomationNow } from "@/lib/automations/client";
import type { TodayDashboardJob, TodayJobStatus } from "@/lib/home/today-dashboard";
import { normalizeDashboardJob } from "@/lib/compatibility";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<
  TodayJobStatus,
  { label: string; className: string }
> = {
  not_started: {
    label: ui.todayDashboard.status.notStarted,
    className: "bg-[var(--background-subtle)] text-[var(--foreground-muted)] ring-1 ring-[var(--border-subtle)]",
  },
  preparing: {
    label: ui.todayDashboard.status.preparing,
    className: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20",
  },
  running: {
    label: ui.todayDashboard.status.running,
    className: "bg-[var(--status-running)]/15 text-[var(--status-running)] ring-1 ring-[var(--status-running)]/25",
  },
  awaiting_review: {
    label: ui.todayDashboard.status.awaitingReview,
    className: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20",
  },
  completed: {
    label: ui.todayDashboard.status.completed,
    className: "bg-[var(--status-success)]/15 text-[var(--status-success)] ring-1 ring-[var(--status-success)]/25",
  },
  skipped: {
    label: ui.todayDashboard.status.skipped,
    className: "bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
  },
};

type HomeTodayWorkCardProps = {
  job: TodayDashboardJob;
  onRefresh?: () => void;
};

export function HomeTodayWorkCard({ job, onRefresh }: HomeTodayWorkCardProps) {
  const router = useRouter();
  const normalizedJob = normalizeDashboardJob(job);
  const status = STATUS_STYLES[normalizedJob.status];
  const isActionable =
    normalizedJob.status !== "completed" && normalizedJob.status !== "skipped";

  const handleStart = async () => {
    if (normalizedJob.automationId) {
      await runAutomationNow(normalizedJob.automationId);
      onRefresh?.();
      return;
    }
    if (normalizedJob.projectId) {
      router.push(`/projects/${normalizedJob.projectId}`);
      return;
    }
    if (normalizedJob.href) router.push(normalizedJob.href);
  };

  const handleReview = () => {
    if (normalizedJob.projectId) {
      router.push(`/projects/${normalizedJob.projectId}`);
      return;
    }
    router.push("/automations");
  };

  const detailsHref = normalizedJob.projectId
    ? `/projects/${normalizedJob.projectId}`
    : normalizedJob.automationId
      ? "/automations"
      : normalizedJob.href;

  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {normalizedJob.icon}
            </span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">{normalizedJob.title}</h3>
                {normalizedJob.scheduledTime && (
                  <span className="text-sm font-medium text-[var(--foreground-muted)]">
                    {normalizedJob.scheduledTime}
                  </span>
                )}
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
              >
                {status.label}
              </span>
            </div>
          </div>
        </div>

        {isActionable && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              variant="primary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void handleStart()}
            >
              {ui.todayDashboard.actions.start}
            </Button>
            {(normalizedJob.status === "awaiting_review" || normalizedJob.projectId) && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
                onClick={handleReview}
              >
                {ui.todayDashboard.actions.review}
              </Button>
            )}
            {detailsHref && (
              <Link href={detailsHref} className="w-full sm:w-auto">
                <Button variant="secondary" size="sm" className="w-full">
                  {ui.todayDashboard.actions.details}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
