import type { Automation } from "@/lib/automations/types";
import { classifyWorkException } from "@/lib/work-asset/exceptions";
import {
  automationToDashboardJob,
  sortAutomationJobs,
  type TodayDashboardJob,
} from "@/lib/home/today-dashboard";
import { mapTodayJobToVisual, type RunVisualStatus } from "@/lib/automation-first/status";
import {
  formatCalendarDateInUserTimeZone,
  formatTimeInUserTimeZone,
} from "@/lib/datetime/display-timezone";

export type HomeAttentionItem = {
  id: string;
  kind: "approval" | "input" | "reconnect" | "failed" | "billing";
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  /** Optional deadline / updated-at ISO for attention cards. */
  meta?: string | null;
};

export type HomeSummary = {
  activeAutomationCount: number;
  attentionItemCount: number;
  attentionCount: number;
  todayScheduledRuns: number;
  scheduledCount: number;
  runningRuns: number;
  runningCount: number;
  awaitingApprovalRuns: number;
  awaitingCount: number;
  needsInputRuns: number;
  completedRuns: number;
  completedCount: number;
  partiallySucceededRuns: number;
  failedRuns: number;
  nextJob: TodayDashboardJob | null;
};

function formatTimeLabel(isoOrLabel: string | null): string {
  if (!isoOrLabel) return "—";
  // Already a display label like "09:00"
  if (/^\d{1,2}:\d{2}/.test(isoOrLabel)) return isoOrLabel.slice(0, 5);
  return formatTimeInUserTimeZone(isoOrLabel, { fallback: isoOrLabel });
}

export function buildTodayJobsFromAutomations(
  automations: Automation[],
  now: Date = new Date(),
): TodayDashboardJob[] {
  const enabled = automations.filter((a) => a.enabled);
  const jobs = enabled.map((a) => automationToDashboardJob(a, false, now));
  return sortAutomationJobs(jobs);
}

export function buildHomeAttentionItems(
  automations: Automation[],
): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];

  for (const automation of automations) {
    if (automation.status === "failed") {
      const exception = classifyWorkException({
        errorText: automation.lastError,
        alreadyPosted: Boolean(
          automation.runHistory.some((row) => row.xPostId && row.status === "completed"),
        ),
      });
      items.push({
        id: `failed:${automation.id}`,
        kind: exception.kind === "x_disconnected" ? "reconnect" : "failed",
        title: exception.title,
        description: exception.body,
        href: exception.cta.href,
        actionLabel: exception.cta.label,
      });
    }

    if (
      automation.enabled &&
      (automation.executionLevel === "approve_then_run" ||
        automation.executionLevel === "suggest_only" ||
        automation.executionLevel === "draft_save") &&
      automation.status === "success"
    ) {
      // Heuristic: recently successful approve-level jobs may need review
      // Only surface when lastRun exists and status suggests review path
    }

    if (
      automation.enabled &&
      automation.executionLevel === "approve_then_run" &&
      automation.status === "idle"
    ) {
      // no-op — idle approve jobs are not attention until a run awaits
    }
  }

  // Failed first, then keep list short
  return items.slice(0, 6);
}

export function buildHomeSummary(
  automations: Automation[],
  jobs: TodayDashboardJob[],
  attention: HomeAttentionItem[],
  extras?: {
    needsInputRuns?: number;
    partiallySucceededRuns?: number;
    failedRuns?: number;
  },
): HomeSummary {
  const activeAutomationCount = automations.filter((a) => a.enabled).length;
  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "preparing").length;
  const awaitingCount = jobs.filter((j) => j.status === "awaiting_review").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const scheduledCount = jobs.filter((j) => j.status === "not_started").length;
  const needsInputRuns = extras?.needsInputRuns ?? 0;
  const partiallySucceededRuns = extras?.partiallySucceededRuns ?? 0;
  const failedRuns =
    extras?.failedRuns ??
    automations.filter((a) => a.status === "failed").length;
  const nextJob =
    jobs.find((j) => j.status === "running" || j.status === "preparing") ??
    jobs.find((j) => j.status === "awaiting_review") ??
    jobs.find((j) => j.status === "not_started") ??
    null;
  const attentionItemCount = attention.length;
  const attentionCount = attentionItemCount + awaitingCount;

  return {
    activeAutomationCount,
    attentionItemCount,
    attentionCount,
    todayScheduledRuns: scheduledCount,
    scheduledCount,
    runningRuns: runningCount,
    runningCount,
    awaitingApprovalRuns: awaitingCount,
    awaitingCount,
    needsInputRuns,
    completedRuns: completedCount,
    completedCount,
    partiallySucceededRuns,
    failedRuns,
    nextJob,
  };
}

/** Merge ops summary counts into the home summary when V2 data is available. */
export function applyOpsSummaryToHomeSummary(
  base: HomeSummary,
  ops: {
    counts: {
      activeAutomations: number;
      awaitingApproval: number;
      needsInput: number;
      running: number;
      succeededToday: number;
      failedToday: number;
    };
    attentionCount: number;
    scheduledToday: number;
    partiallySucceeded?: number;
  },
): HomeSummary {
  return {
    ...base,
    activeAutomationCount: ops.counts.activeAutomations,
    attentionItemCount: ops.attentionCount,
    attentionCount: ops.attentionCount,
    todayScheduledRuns: ops.scheduledToday,
    scheduledCount: ops.scheduledToday,
    runningRuns: ops.counts.running,
    runningCount: ops.counts.running,
    awaitingApprovalRuns: ops.counts.awaitingApproval,
    awaitingCount: ops.counts.awaitingApproval,
    needsInputRuns: ops.counts.needsInput,
    completedRuns: ops.counts.succeededToday,
    completedCount: ops.counts.succeededToday,
    partiallySucceededRuns: ops.partiallySucceeded ?? base.partiallySucceededRuns,
    failedRuns: ops.counts.failedToday,
  };
}

export function jobsToTimelineItems(jobs: TodayDashboardJob[]): Array<{
  id: string;
  timeLabel: string;
  title: string;
  subtitle?: string;
  status: RunVisualStatus;
  href: string;
  actionLabel?: string;
}> {
  return jobs.slice(0, 8).map((job) => {
    const status = mapTodayJobToVisual(job.status);
    const actionLabel =
      status === "pending_approval"
        ? "確認する"
        : status === "running"
          ? "進捗を見る"
          : "詳細";
    return {
      id: job.id,
      timeLabel: formatTimeLabel(job.scheduledTime),
      title: job.title,
      subtitle: job.activityLabel ?? job.scheduleLabel ?? job.subtitle,
      status,
      href: job.href ?? "/automations",
      actionLabel,
    };
  });
}

export function formatTodayDateLabel(now: Date = new Date()): string {
  return formatCalendarDateInUserTimeZone(now);
}

export function greetingForHour(hour: number): string {
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "お疲れ様です";
}
