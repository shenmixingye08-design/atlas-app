import type {
  TodayDashboardJob,
  TodayDashboardJobKind,
  TodayJobStatus,
} from "@/lib/home/today-dashboard";

import {
  asNumber,
  asOptionalString,
  asString,
  clampNumber,
  isRecord,
  pickEnum,
} from "./guards";

const JOB_KINDS = ["automation", "project", "suggestion"] as const satisfies readonly TodayDashboardJobKind[];

const JOB_STATUSES = [
  "not_started",
  "preparing",
  "running",
  "awaiting_review",
  "completed",
  "skipped",
] as const satisfies readonly TodayJobStatus[];

const DEFAULT_JOB_STATUS: TodayJobStatus = "not_started";
const DEFAULT_ICON = "📋";

/**
 * Normalize a dashboard job record for safe rendering.
 * Extend this function when new TodayDashboardJob fields are added.
 */
export function normalizeDashboardJob(raw: unknown): TodayDashboardJob {
  const record = isRecord(raw) ? raw : {};
  const kind = pickEnum(record.kind, JOB_KINDS, "project");
  const status = pickEnum(record.status, JOB_STATUSES, DEFAULT_JOB_STATUS);
  const progressRaw = record.progress;

  const progress =
    progressRaw === null || progressRaw === undefined
      ? null
      : clampNumber(asNumber(progressRaw, 0), 0, 100);

  const scheduledTime = asOptionalString(record.scheduledTime);
  const activityLabel = asOptionalString(record.activityLabel);
  const automationId = asOptionalString(record.automationId) ?? undefined;
  const projectId = asOptionalString(record.projectId) ?? undefined;
  const scheduleLabel = asOptionalString(record.scheduleLabel) ?? undefined;
  const href = asOptionalString(record.href) ?? undefined;
  const id = asString(record.id, `${kind}:unknown`);

  return {
    id,
    kind,
    title: asString(record.title, "無題の仕事"),
    subtitle: asString(record.subtitle, ""),
    status,
    icon: asString(record.icon, DEFAULT_ICON),
    scheduledTime,
    progress,
    activityLabel,
    automationId,
    projectId,
    scheduleLabel,
    href,
  };
}

/** Normalize an array of dashboard jobs. */
export function normalizeDashboardJobs(raw: unknown): TodayDashboardJob[] {
  return Array.isArray(raw) ? raw.map(normalizeDashboardJob) : [];
}
