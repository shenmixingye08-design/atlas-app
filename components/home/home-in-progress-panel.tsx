"use client";

import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  isActiveJob,
  partitionProjectsForToday,
} from "@/lib/home/today-dashboard";
import { MotionList, MotionListItem } from "@/components/motion/list-item";
import { ProgressBar } from "@/components/ui/progress";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeInProgressPanelProps = {
  automations: Automation[];
  projects: Project[];
};

export function HomeInProgressPanel({
  automations,
  projects,
}: HomeInProgressPanelProps) {
  const activeJobs = useMemo(() => {
    try {
      const automationsSafe = normalizeAutomations(automations);
      const projectsSafe = normalizeProjects(projects);

      const runningAutomations = automationsSafe
        .filter((automation) => automation.status === "running")
        .map((automation) => automationToDashboardJob(automation, false));

      const { inProgress } = partitionProjectsForToday(projectsSafe);

      return [...runningAutomations, ...inProgress.filter(isActiveJob)];
    } catch (error) {
      console.error("[HomeInProgressPanel]", error);
      return [];
    }
  }, [automations, projects]);

  if (activeJobs.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="in-progress-heading" className="space-y-6">
      <h2 id="in-progress-heading" className="text-xl font-semibold text-foreground">
        {ui.todayDashboard.sections.inProgress}
      </h2>
      <MotionList className="space-y-4">
        {activeJobs.map((job, index) => (
          <MotionListItem
            key={job.id}
            index={index}
            className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)] sm:p-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xl" aria-hidden>
                  {job.icon}
                </span>
                <p className="truncate text-base font-medium text-foreground">
                  {job.activityLabel ?? job.title}
                </p>
              </div>
              {typeof job.progress === "number" ? (
                <ProgressBar value={job.progress} size="md" />
              ) : (
                <ProgressBar value={0} size="md" indeterminate />
              )}
            </div>
          </MotionListItem>
        ))}
      </MotionList>
    </section>
  );
}
