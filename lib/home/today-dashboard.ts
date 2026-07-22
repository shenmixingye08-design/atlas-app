import type { Automation } from "@/lib/automations/types";
import { wasAutomationCompletedToday } from "@/lib/automations/today";
import {
  normalizeAutomation,
  normalizeDashboardJob,
  normalizeProject,
  normalizeProjects,
  parseTimestamp,
  safeSlice,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import {
  formatAutomationScheduledTime,
  getWorkActivityLabel,
  getWorkCategoryIcon,
  inferWorkCategoryFromAutomation,
  inferWorkCategoryFromProject,
} from "./monthly-achievements";

/** Unified job status shown on today's dashboard. */
export type TodayJobStatus =
  | "not_started"
  | "preparing"
  | "running"
  | "awaiting_review"
  | "completed"
  | "skipped";

export type TodayDashboardJobKind = "automation" | "project" | "suggestion";

export type TodayDashboardJob = {
  id: string;
  kind: TodayDashboardJobKind;
  title: string;
  subtitle: string;
  status: TodayJobStatus;
  icon: string;
  scheduledTime: string | null;
  progress: number | null;
  activityLabel: string | null;
  automationId?: string;
  projectId?: string;
  scheduleLabel?: string;
  href?: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isUpdatedToday(iso: string, now: Date): boolean {
  const updatedAt = parseTimestamp(iso);
  if (Number.isNaN(updatedAt)) return false;
  return now.getTime() - updatedAt < MS_PER_DAY;
}

export function deriveAutomationJobStatus(
  automation: Automation,
  skipped: boolean,
  now: Date = new Date(),
): TodayJobStatus {
  if (skipped) return "skipped";
  if (automation.status === "running") return "running";
  if (wasAutomationCompletedToday(automation, now)) {
    if (
      automation.executionLevel === "approve_then_run" ||
      automation.executionLevel === "suggest_only" ||
      automation.executionLevel === "draft_save"
    ) {
      return "awaiting_review";
    }
    return "completed";
  }
  if (automation.status === "failed") return "awaiting_review";
  return "not_started";
}

export function deriveProjectJobStatus(project: Project): TodayJobStatus {
  switch (project.status) {
    case "running":
      return "running";
    case "review":
      return "awaiting_review";
    case "completed":
      return "completed";
    default:
      return "not_started";
  }
}

export function automationToDashboardJob(
  automationInput: Automation,
  skipped: boolean,
  now: Date = new Date(),
): TodayDashboardJob {
  const automation = normalizeAutomation(automationInput);
  const category = inferWorkCategoryFromAutomation(automation);
  const status = deriveAutomationJobStatus(automation, skipped, now);
  const scheduleLabel =
    automation.schedule.kind === "schedule" ? automation.schedule.label : "";

  return normalizeDashboardJob({
    id: `automation:${automation.id}`,
    kind: "automation",
    title: automation.name,
    subtitle: scheduleLabel,
    scheduleLabel: scheduleLabel || undefined,
    status,
    icon: getWorkCategoryIcon(category),
    scheduledTime: formatAutomationScheduledTime(automation),
    progress: null,
    activityLabel: status === "running" ? getWorkActivityLabel(category) : null,
    automationId: automation.id,
    href: "/automations",
  });
}

export function projectToDashboardJob(projectInput: Project): TodayDashboardJob {
  const project = normalizeProject(projectInput);
  const category = inferWorkCategoryFromProject(project);
  const status = deriveProjectJobStatus(project);

  return normalizeDashboardJob({
    id: `project:${project.id}`,
    kind: "project",
    title: project.title,
    subtitle: safeSlice(project.workRequest, 0, 60),
    status,
    icon: getWorkCategoryIcon(category),
    scheduledTime: null,
    progress: null,
    activityLabel: status === "running" ? getWorkActivityLabel(category) : null,
    projectId: project.id,
    href: `/projects/${project.id}`,
  });
}

export function partitionProjectsForToday(
  projectsInput: Project[],
  now: Date = new Date(),
): {
  inProgress: TodayDashboardJob[];
  completed: TodayDashboardJob[];
  nextUp: TodayDashboardJob[];
} {
  const projects = normalizeProjects(projectsInput);
  const inProgress: { job: TodayDashboardJob; updatedAt: string }[] = [];
  const completed: { job: TodayDashboardJob; updatedAt: string }[] = [];
  const nextUp: { job: TodayDashboardJob; updatedAt: string }[] = [];

  for (const project of projects) {
    const job = projectToDashboardJob(project);
    const updatedAt = project.updatedAt;

    if (project.status === "running" || project.status === "review") {
      inProgress.push({ job, updatedAt });
      continue;
    }

    if (project.status === "completed" && isUpdatedToday(updatedAt, now)) {
      completed.push({ job, updatedAt });
      continue;
    }

    if (project.status === "pending") {
      nextUp.push({ job, updatedAt });
    }
  }

  const sortByUpdated = (
    items: { job: TodayDashboardJob; updatedAt: string }[],
  ) =>
    items
      .sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
      .map((item) => item.job);

  return {
    inProgress: sortByUpdated(inProgress).slice(0, 5),
    completed: sortByUpdated(completed).slice(0, 5),
    nextUp: sortByUpdated(nextUp).slice(0, 5),
  };
}

export function sortAutomationJobs(jobs: TodayDashboardJob[]): TodayDashboardJob[] {
  const order: Record<TodayJobStatus, number> = {
    running: 0,
    preparing: 1,
    awaiting_review: 2,
    not_started: 3,
    completed: 4,
    skipped: 5,
  };

  return [...jobs].sort((a, b) => order[a.status] - order[b.status]);
}

export function isActiveJob(job: TodayDashboardJob): boolean {
  const normalized = normalizeDashboardJob(job);
  return normalized.status === "running" || normalized.status === "preparing";
}
