/**
 * Count work MINERVOT actually finished. Success only.
 * Planned / failed / cancelled runs are excluded.
 */

import {
  asArray,
  normalizeAutomation,
  normalizeProject,
} from "@/lib/compatibility";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

function isSameMonth(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  );
}

export function countSuccessfulFinishedWorkThisMonth(input: {
  projects?: readonly Project[];
  automations?: readonly Automation[];
  xAutoPostsPostedThisMonth?: number;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const projects = asArray(input.projects ?? []).map((project) =>
    normalizeProject(project),
  );
  const automations = asArray(input.automations ?? []).map((automation) =>
    normalizeAutomation(automation),
  );

  const completedProjects = projects.filter(
    (project) =>
      project.status === "completed" && isSameMonth(project.updatedAt, now),
  ).length;

  const completedAutomations = automations.filter(
    (automation) =>
      automation.status === "success" &&
      automation.lastRun &&
      isSameMonth(automation.lastRun, now),
  ).length;

  const xPosted = Math.max(0, Math.trunc(input.xAutoPostsPostedThisMonth ?? 0));

  return completedProjects + completedAutomations + xPosted;
}

export function formatFinishedWorkThisMonthLine(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return `今月MINERVOTが ${count}件の仕事を自動で完了`;
}
