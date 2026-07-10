"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { runAutomationNow } from "@/lib/automations/client";
import type { TodayDashboardJob, TodayJobStatus } from "@/lib/home/today-dashboard";
import {
  skipAutomationToday,
  skipProjectToday,
} from "@/lib/home/today-skipped-store";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type TodayDashboardJobRowProps = {
  job: TodayDashboardJob;
  onSkip?: () => void;
  onRefresh?: () => void;
};

const STATUS_STYLES: Record<
  TodayJobStatus,
  { label: string; className: string }
> = {
  not_started: {
    label: ui.todayDashboard.status.notStarted,
    className: "bg-[var(--card)] text-[var(--foreground-muted)] ring-1 ring-[var(--border-subtle)]",
  },
  preparing: {
    label: ui.todayDashboard.status.preparing,
    className: "bg-sky-500/10 text-sky-700",
  },
  running: {
    label: ui.todayDashboard.status.running,
    className: "bg-[var(--status-running)]/15 text-[var(--status-running)]",
  },
  awaiting_review: {
    label: ui.todayDashboard.status.awaitingReview,
    className: "bg-amber-500/10 text-amber-700",
  },
  completed: {
    label: ui.todayDashboard.status.completed,
    className: "bg-[var(--status-success)]/15 text-[var(--status-success)]",
  },
  skipped: {
    label: ui.todayDashboard.status.skipped,
    className: "bg-[var(--background-subtle)] text-[var(--foreground-muted)] line-through",
  },
};

export function TodayDashboardJobRow({
  job,
  onSkip,
  onRefresh,
}: TodayDashboardJobRowProps) {
  const router = useRouter();
  const status = STATUS_STYLES[job.status];
  const isActionable = job.status !== "completed" && job.status !== "skipped";

  const handleRunNow = async () => {
    if (job.automationId) {
      await runAutomationNow(job.automationId);
      onRefresh?.();
      return;
    }
    if (job.projectId) {
      router.push(`/projects/${job.projectId}`);
      return;
    }
    if (job.href) router.push(job.href);
  };

  const handleReview = () => {
    if (job.projectId) {
      router.push(`/projects/${job.projectId}`);
      return;
    }
    if (job.automationId) {
      router.push("/automations");
    }
  };

  const handleSkip = () => {
    if (job.automationId) skipAutomationToday(job.automationId);
    if (job.projectId) skipProjectToday(job.projectId);
    onSkip?.();
  };

  const settingsHref = job.automationId
    ? "/automations"
    : job.projectId
      ? `/projects/${job.projectId}`
      : job.href;

  return (
    <li className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{job.title}</p>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          {job.scheduleLabel && (
            <p className="text-sm text-[var(--foreground-muted)]">{job.scheduleLabel}</p>
          )}
          {job.subtitle && !job.scheduleLabel && (
            <p className="text-sm text-[var(--foreground-muted)]">{job.subtitle}</p>
          )}
          {job.subtitle && job.scheduleLabel && job.subtitle !== job.scheduleLabel && (
            <p className="text-caption text-[var(--foreground-muted)]">{job.subtitle}</p>
          )}
        </div>

        {isActionable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleRunNow()}>
              {ui.todayDashboard.actions.start}
            </Button>
            {(job.status === "awaiting_review" || job.projectId) && (
              <Button variant="secondary" size="sm" onClick={handleReview}>
                {ui.todayDashboard.actions.review}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleSkip}>
              {ui.todayDashboard.actions.skip}
            </Button>
            {settingsHref && (
              <Link href={settingsHref}>
                <Button variant="secondary" size="sm">
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
