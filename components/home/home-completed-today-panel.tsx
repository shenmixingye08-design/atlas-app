"use client";

import { useMemo } from "react";

import { getTodaysAutomations } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  partitionProjectsForToday,
} from "@/lib/home/today-dashboard";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeCompletedTodayPanelProps = {
  automations: Automation[];
  projects: Project[];
};

export function HomeCompletedTodayPanel({
  automations,
  projects,
}: HomeCompletedTodayPanelProps) {
  const completedJobs = useMemo(() => {
    try {
      const automationsSafe = normalizeAutomations(automations);
      const projectsSafe = normalizeProjects(projects);

      const completedAutomations = getTodaysAutomations(automationsSafe)
        .filter(({ completed }) => completed)
        .map(({ automation }) => automationToDashboardJob(automation, false));

      const { completed: completedProjects } = partitionProjectsForToday(projectsSafe);

      return [...completedAutomations, ...completedProjects];
    } catch (error) {
      console.error("[HomeCompletedTodayPanel]", error);
      return [];
    }
  }, [automations, projects]);

  if (completedJobs.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="completed-today-heading" className="space-y-5">
      <h2 id="completed-today-heading" className="text-xl font-semibold text-foreground">
        {ui.todayDashboard.sections.completed}
      </h2>
      <ul className="space-y-3">
        {completedJobs.map((job) => (
          <li
            key={job.id}
            className="flex min-w-0 items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5 text-sm sm:px-5 sm:py-4"
          >
            <span className="text-base text-[var(--status-success)]" aria-hidden>
              ✓
            </span>
            <span className="text-base" aria-hidden>
              {job.icon}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{job.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
