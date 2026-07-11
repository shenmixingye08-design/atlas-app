import type { Automation } from "@/lib/automations/types";
import { getTodaysAutomations } from "@/lib/automations/today";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { isSafeActionUrl } from "@/lib/notifications/display";
import type { NotificationRecord } from "@/lib/notifications/types";
import type { Project } from "@/lib/projects/types";

export type SecretaryProactivePriority = 1 | 2 | 3 | 4 | 5;

export type SecretaryProactiveItem = {
  id: string;
  title: string;
  description: string;
  reason: string;
  continueHref: string;
  confirmHref: string;
  priority: SecretaryProactivePriority;
};

const NEAR_DEADLINE_MS = 72 * 60 * 60 * 1000;
const NEAR_NEXT_RUN_MS = 24 * 60 * 60 * 1000;

/** Matches deadline lines appended by the work request form. */
const DEADLINE_IN_REQUEST =
  /【期限】\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?)/;

function trimLabel(value: string, max = 48): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function projectLabel(project: Project): string {
  return trimLabel(project.title || project.workRequest);
}

function workspaceHref(assignment: string): string {
  return `/workspace?assignment=${encodeURIComponent(assignment)}`;
}

function formatDateTime(isoOrLocal: string): string {
  const normalized = isoOrLocal.includes("T")
    ? isoOrLocal
    : isoOrLocal.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return isoOrLocal.trim();
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function extractDeadlineFromWorkRequest(
  workRequest: string,
): Date | null {
  const match = workRequest.match(DEADLINE_IN_REQUEST);
  if (!match?.[1]) return null;
  const raw = match[1].trim().replace(" ", "T");
  const date = new Date(raw.length === 10 ? `${raw}T23:59:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isNearDeadline(deadline: Date, now: Date): boolean {
  const diff = deadline.getTime() - now.getTime();
  return diff <= NEAR_DEADLINE_MS;
}

/**
 * Build proactive secretary suggestions from existing data only.
 * Priority: near deadline → incomplete → habits → recent → notifications.
 */
export function buildSecretaryProactiveItems(input: {
  projects: Project[];
  automations: Automation[];
  notifications: NotificationRecord[];
  now?: Date;
}): SecretaryProactiveItem[] {
  const now = input.now ?? new Date();
  const projects = normalizeProjects(input.projects);
  const automations = normalizeAutomations(input.automations);
  const items: SecretaryProactiveItem[] = [];

  // ① Near deadline — incomplete projects with 【期限】, or habits with soon nextRun
  const deadlineProjects = projects
    .filter(
      (project) =>
        project.status === "pending" ||
        project.status === "running" ||
        project.status === "review",
    )
    .map((project) => ({
      project,
      deadline: extractDeadlineFromWorkRequest(project.workRequest),
    }))
    .filter(
      (entry): entry is { project: Project; deadline: Date } =>
        entry.deadline !== null && isNearDeadline(entry.deadline, now),
    )
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  for (const { project, deadline } of deadlineProjects) {
    const label = projectLabel(project);
    if (!label) continue;
    const overdue = deadline.getTime() < now.getTime();
    items.push({
      id: `deadline-project-${project.id}`,
      title: label,
      description:
        project.status === "review"
          ? `「${label}」の確認が残っています。`
          : `「${label}」の続きを進められます。`,
      reason: overdue
        ? `期限を過ぎています（${formatDateTime(deadline.toISOString())}）`
        : `期限が近づいています（${formatDateTime(deadline.toISOString())}）`,
      continueHref: project.workRequest.trim()
        ? workspaceHref(project.workRequest)
        : `/projects/${project.id}`,
      confirmHref: `/projects/${project.id}`,
      priority: 1,
    });
  }

  const soonHabits = automations
    .filter((automation) => automation.enabled && automation.nextRun)
    .map((automation) => ({
      automation,
      nextRun: new Date(automation.nextRun as string),
    }))
    .filter(({ nextRun }) => {
      const diff = nextRun.getTime() - now.getTime();
      return diff <= NEAR_NEXT_RUN_MS;
    })
    .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());

  for (const { automation, nextRun } of soonHabits) {
    const name = trimLabel(automation.name);
    if (!name) continue;
    const assignment = automation.workflow?.assignment?.trim() ?? "";
    const due = nextRun.getTime() <= now.getTime();
    items.push({
      id: `deadline-habit-${automation.id}`,
      title: name,
      description: assignment
        ? trimLabel(assignment, 72)
        : `「${name}」の実行タイミングです。`,
      reason: due
        ? `予定時刻を過ぎています（${formatDateTime(nextRun.toISOString())}）`
        : `まもなく実行予定です（${formatDateTime(nextRun.toISOString())}）`,
      continueHref: assignment ? workspaceHref(assignment) : "/automations",
      confirmHref: "/automations",
      priority: 1,
    });
  }

  // ② Incomplete (without near-deadline already listed)
  const incomplete = projects
    .filter(
      (project) =>
        project.status === "pending" ||
        project.status === "running" ||
        project.status === "review",
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  for (const project of incomplete) {
    if (items.some((item) => item.id === `deadline-project-${project.id}`)) {
      continue;
    }
    const label = projectLabel(project);
    if (!label) continue;
    items.push({
      id: `incomplete-${project.id}`,
      title: label,
      description:
        project.status === "review"
          ? `「${label}」の確認が残っています。`
          : `「${label}」の続きを行いますか？`,
      reason:
        project.status === "review"
          ? "確認待ちの未完了仕事です"
          : project.status === "running"
            ? "進行中の未完了仕事です"
            : "未完了の仕事です",
      continueHref: project.workRequest.trim()
        ? workspaceHref(project.workRequest)
        : `/projects/${project.id}`,
      confirmHref: `/projects/${project.id}`,
      priority: 2,
    });
  }

  // ③ Habits
  const todayHabits = getTodaysAutomations(automations, now)
    .map(({ automation }) => automation)
    .filter((automation) => automation.enabled);

  const habitPool =
    todayHabits.length > 0
      ? todayHabits
      : automations
          .filter((automation) => automation.enabled)
          .sort((a, b) => {
            const aNext = a.nextRun
              ? new Date(a.nextRun).getTime()
              : Number.MAX_SAFE_INTEGER;
            const bNext = b.nextRun
              ? new Date(b.nextRun).getTime()
              : Number.MAX_SAFE_INTEGER;
            return aNext - bNext;
          });

  for (const automation of habitPool) {
    if (items.some((item) => item.id === `deadline-habit-${automation.id}`)) {
      continue;
    }
    const name = trimLabel(automation.name);
    if (!name) continue;
    const assignment = automation.workflow?.assignment?.trim() ?? "";
    const scheduleLabel =
      automation.schedule.kind === "schedule"
        ? automation.schedule.label
        : null;
    items.push({
      id: `habit-${automation.id}`,
      title: name,
      description: assignment
        ? trimLabel(assignment, 72)
        : `「${name}」を実行しますか？`,
      reason: scheduleLabel
        ? `習慣登録されています（${scheduleLabel}）`
        : "習慣登録されている仕事です",
      continueHref: assignment ? workspaceHref(assignment) : "/automations",
      confirmHref: "/automations",
      priority: 3,
    });
  }

  // ④ Recent completed
  const recent = projects
    .filter((project) => project.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  for (const project of recent) {
    const label = projectLabel(project);
    const assignment = project.workRequest.trim();
    if (!label || !assignment) continue;
    items.push({
      id: `recent-${project.id}`,
      title: label,
      description: `前回の「${label}」と同じ依頼をもう一度行いますか？`,
      reason: `最近完了した仕事です（${formatDateTime(project.updatedAt)}）`,
      continueHref: workspaceHref(assignment),
      confirmHref: `/projects/${project.id}`,
      priority: 4,
    });
  }

  // ⑤ Notifications
  const notices = [...input.notifications].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const notice of notices) {
    const title = trimLabel(notice.title || notice.message);
    const description = trimLabel(notice.message || notice.title, 80);
    if (!title || !description) continue;
    const action =
      notice.actionUrl && isSafeActionUrl(notice.actionUrl)
        ? notice.actionUrl
        : "/notifications";
    items.push({
      id: `notice-${notice.notificationId}`,
      title,
      description,
      reason: notice.isRead ? "お知らせがあります" : "未読のお知らせです",
      continueHref: action,
      confirmHref: "/notifications",
      priority: 5,
    });
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => a.priority - b.priority)
    .filter((item) => {
      const key = `${item.title}|${item.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}
