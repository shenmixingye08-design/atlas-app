import type { Automation } from "@/lib/automations/types";
import { shouldShowNextRun } from "@/lib/automations/pause-display";
import { filterCompletedDeliverableProjects } from "@/lib/deliverables/completed-filter";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import { computeTodayWorkSummary } from "./today-work-summary";

export type HomeActionSummary = {
  approvalCount: number;
  failureCount: number;
  nextAutomation: { id: string; name: string; nextRun: string } | null;
  recentDeliverables: Array<{ id: string; title: string }>;
  todayCounts: ReturnType<typeof computeTodayWorkSummary>;
};

export function computeHomeActionSummary(
  projectsInput: readonly Project[],
  automationsInput: readonly Automation[],
  now: Date = new Date(),
): HomeActionSummary {
  const projects = normalizeProjects(projectsInput);
  const automations = normalizeAutomations(automationsInput);

  const approvalCount =
    projects.filter((p) => p.status === "review").length +
    automations.filter(
      (a) =>
        a.enabled &&
        (a.executionLevel === "approve_then_run" ||
          a.executionLevel === "suggest_only" ||
          a.executionLevel === "draft_save") &&
        a.status === "success",
    ).length;

  const failureCount =
    projects.filter((p) => Boolean(p.error)).length +
    automations.filter((a) => a.status === "failed").length;

  const enabledWithNext = automations
    .filter((a) => shouldShowNextRun(a))
    .sort((a, b) => {
      const aTime = a.nextRun ? new Date(a.nextRun).getTime() : Infinity;
      const bTime = b.nextRun ? new Date(b.nextRun).getTime() : Infinity;
      return aTime - bTime;
    });

  const next = enabledWithNext[0] ?? null;

  const recentDeliverables = filterCompletedDeliverableProjects(projects)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 5)
    .map((p) => ({ id: p.id, title: p.title }));

  return {
    approvalCount,
    failureCount,
    nextAutomation: next?.nextRun
      ? { id: next.id, name: next.name, nextRun: next.nextRun }
      : null,
    recentDeliverables,
    todayCounts: computeTodayWorkSummary(projects, automations, now),
  };
}
