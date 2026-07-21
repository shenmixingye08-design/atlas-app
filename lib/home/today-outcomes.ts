import type { Automation } from "@/lib/automations/types";
import {
  asArray,
  normalizeAutomation,
  normalizeProject,
  parseTimestamp,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import { inferWorkCategory } from "./monthly-achievements";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isUpdatedToday(iso: string, now: Date): boolean {
  const updatedAt = parseTimestamp(iso);
  if (Number.isNaN(updatedAt)) return false;
  return now.getTime() - updatedAt < MS_PER_DAY;
}

export type TodayOutcomeStats = {
  completedTasks: number;
  aiRunning: number;
  hoursSaved: number;
  snsPosts: number;
  emailSent: number;
  materialsGenerated: number;
};

function countCompletedToday(
  items: Array<{ text: string; completedAt: string | null }>,
  category: "sns" | "blog" | "sales" | "email",
  now: Date,
): number {
  return items.filter(
    (item) =>
      item.completedAt &&
      isUpdatedToday(item.completedAt, now) &&
      inferWorkCategory(item.text) === category,
  ).length;
}

export function computeTodayOutcomes(
  projectsInput: readonly Project[],
  automationsInput: readonly Automation[],
  now: Date = new Date(),
): TodayOutcomeStats {
  const projects = asArray(projectsInput).map((project) => normalizeProject(project));
  const automations = asArray(automationsInput).map((automation) =>
    normalizeAutomation(automation),
  );

  const completedProjects = projects
    .filter(
      (project) =>
        project.status === "completed" && isUpdatedToday(project.updatedAt, now),
    )
    .map((project) => ({
      text: `${project.title} ${project.workRequest}`,
      completedAt: project.updatedAt,
    }));

  const completedAutomations = automations
    .filter(
      (automation) =>
        automation.lastRun &&
        isUpdatedToday(automation.lastRun, now) &&
        automation.status === "success",
    )
    .map((automation) => ({
      text: `${automation.name} ${automation.workflow.assignment}`,
      completedAt: automation.lastRun,
    }));

  const completedItems = [...completedProjects, ...completedAutomations];
  const snsPosts = countCompletedToday(completedItems, "sns", now);
  const blogPosts = countCompletedToday(completedItems, "blog", now);
  const salesMaterials = countCompletedToday(completedItems, "sales", now);
  const emailSent = countCompletedToday(completedItems, "email", now);

  const completedTasks = completedItems.length;
  const materialsGenerated = blogPosts + salesMaterials;
  const hoursSaved =
    completedTasks > 0
      ? Math.max(1, Math.round(completedTasks * 0.5 + snsPosts * 0.25 + emailSent * 0.15))
      : 0;

  const aiRunning =
    projects.filter((project) => project.status === "running").length +
    automations.filter((automation) => automation.status === "running").length;

  return {
    completedTasks,
    aiRunning,
    hoursSaved,
    snsPosts,
    emailSent,
    materialsGenerated,
  };
}
