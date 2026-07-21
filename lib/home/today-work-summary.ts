import { getTodaysAutomations, wasAutomationCompletedToday } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import {
  asArray,
  normalizeAutomation,
  normalizeProject,
  parseTimestamp,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import { deriveAutomationJobStatus, deriveProjectJobStatus } from "./today-dashboard";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isUpdatedToday(iso: string, now: Date): boolean {
  const updatedAt = parseTimestamp(iso);
  if (Number.isNaN(updatedAt)) return false;
  return now.getTime() - updatedAt < MS_PER_DAY;
}

export type TodayWorkSummary = {
  running: number;
  completed: number;
  waiting: number;
  error: number;
};

export function computeTodayWorkSummary(
  projectsInput: readonly Project[],
  automationsInput: readonly Automation[],
  now: Date = new Date(),
): TodayWorkSummary {
  const projects = asArray(projectsInput).map((project) => normalizeProject(project));
  const automations = asArray(automationsInput).map((automation) =>
    normalizeAutomation(automation),
  );

  let running = 0;
  let completed = 0;
  let waiting = 0;
  let error = 0;

  for (const project of projects) {
    const status = deriveProjectJobStatus(project);
    if (status === "running" || status === "preparing") {
      running += 1;
      continue;
    }
    if (status === "completed" && isUpdatedToday(project.updatedAt, now)) {
      completed += 1;
      continue;
    }
    if (status === "awaiting_review") {
      waiting += 1;
      continue;
    }
    if (status === "not_started" && isUpdatedToday(project.createdAt, now)) {
      waiting += 1;
      continue;
    }
    if (project.result?.status === "failed") {
      error += 1;
    }
  }

  for (const automation of automations) {
    const status = deriveAutomationJobStatus(automation, false, now);
    if (automation.status === "running") {
      running += 1;
      continue;
    }
    if (wasAutomationCompletedToday(automation, now)) {
      completed += 1;
      continue;
    }
    if (automation.status === "failed") {
      error += 1;
      continue;
    }
    if (
      getTodaysAutomations(automations, now).some(
        (item) => item.automation.id === automation.id,
      ) &&
      (status === "not_started" || status === "awaiting_review")
    ) {
      waiting += 1;
    }
  }

  return { running, completed, waiting, error };
}
