import type { Automation } from "@/lib/automations/types";
import { getTodaysAutomations } from "@/lib/automations/today";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { isSafeActionUrl } from "@/lib/notifications/display";
import type { NotificationRecord } from "@/lib/notifications/types";
import type { Project } from "@/lib/projects/types";

export type SecretaryMemoryItem = {
  id: string;
  message: string;
  continueHref: string;
  confirmHref: string;
  /** 1 incomplete → 2 recent → 3 habit → 4 notification */
  priority: 1 | 2 | 3 | 4;
};

function trimLabel(value: string, max = 42): string {
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

/**
 * Build "AI秘書から" memory prompts from existing user data only.
 * No dummy rows, no invented job content.
 */
export function buildSecretaryMemoryItems(input: {
  projects: Project[];
  automations: Automation[];
  notifications: NotificationRecord[];
  now?: Date;
}): SecretaryMemoryItem[] {
  const now = input.now ?? new Date();
  const projects = normalizeProjects(input.projects);
  const automations = normalizeAutomations(input.automations);
  const items: SecretaryMemoryItem[] = [];

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
    const label = projectLabel(project);
    if (!label) continue;

    const message =
      project.status === "review"
        ? `「${label}」の確認が残っています。`
        : `「${label}」の続きを行いますか？`;

    items.push({
      id: `incomplete-${project.id}`,
      message,
      continueHref: project.workRequest.trim()
        ? workspaceHref(project.workRequest)
        : `/projects/${project.id}`,
      confirmHref: `/projects/${project.id}`,
      priority: 1,
    });
  }

  const recent = projects
    .filter((project) => project.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  for (const project of recent) {
    const label = projectLabel(project);
    if (!label) continue;
    const assignment = project.workRequest.trim();
    if (!assignment) continue;

    items.push({
      id: `recent-${project.id}`,
      message: `前回の「${label}」と同じ依頼をもう一度行いますか？`,
      continueHref: workspaceHref(assignment),
      confirmHref: `/projects/${project.id}`,
      priority: 2,
    });
  }

  const todayHabits = getTodaysAutomations(automations, now)
    .map(({ automation }) => automation)
    .filter((automation) => automation.enabled);

  const habitPool =
    todayHabits.length > 0
      ? todayHabits
      : automations
          .filter((automation) => automation.enabled)
          .sort((a, b) => {
            const aNext = a.nextRun ? new Date(a.nextRun).getTime() : Number.MAX_SAFE_INTEGER;
            const bNext = b.nextRun ? new Date(b.nextRun).getTime() : Number.MAX_SAFE_INTEGER;
            return aNext - bNext;
          });

  for (const automation of habitPool) {
    const name = trimLabel(automation.name);
    if (!name) continue;
    const assignment = automation.workflow?.assignment?.trim() ?? "";

    items.push({
      id: `habit-${automation.id}`,
      message: `「${name}」を実行しますか？`,
      continueHref: assignment ? workspaceHref(assignment) : "/automations",
      confirmHref: "/automations",
      priority: 3,
    });
  }

  const notices = [...input.notifications].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const notice of notices) {
    const message = trimLabel(notice.message || notice.title, 80);
    if (!message) continue;
    const action =
      notice.actionUrl && isSafeActionUrl(notice.actionUrl)
        ? notice.actionUrl
        : "/notifications";

    items.push({
      id: `notice-${notice.notificationId}`,
      message,
      continueHref: action,
      confirmHref: "/notifications",
      priority: 4,
    });
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => a.priority - b.priority)
    .filter((item) => {
      if (seen.has(item.message)) return false;
      seen.add(item.message);
      return true;
    })
    .slice(0, 3);
}
