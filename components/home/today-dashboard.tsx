"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { getTodaysAutomations } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import {
  automationToDashboardJob,
  partitionProjectsForToday,
  sortAutomationJobs,
  type TodayDashboardJob,
} from "@/lib/home/today-dashboard";
import {
  getSkippedAutomationIds,
  getSkippedProjectIds,
  isAutomationSkippedToday,
  isProjectSkippedToday,
} from "@/lib/home/today-skipped-store";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ProactiveSuggestionsPanel } from "./proactive-suggestions-panel";
import { TodayDashboardJobRow } from "./today-dashboard-job-row";

type TodayDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

function DashboardSection({
  title,
  jobs,
  emptyMessage,
  onSkip,
  onRefresh,
}: {
  title: string;
  jobs: TodayDashboardJob[];
  emptyMessage: string;
  onSkip: () => void;
  onRefresh: () => void;
}) {
  if (jobs.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-3">
        {jobs.map((job) => (
          <TodayDashboardJobRow
            key={job.id}
            job={job}
            onSkip={onSkip}
            onRefresh={onRefresh}
          />
        ))}
      </ul>
    </div>
  );
}

export function TodayDashboard({ automations, projects }: TodayDashboardProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    automationJobs,
    inProgress,
    completed,
    nextUp,
  } = useMemo(() => {
    void refreshKey;
    const skippedAutomationIds = new Set(getSkippedAutomationIds());
    const skippedProjectIds = new Set(getSkippedProjectIds());

    const todaysAutomations = getTodaysAutomations(automations).map(({ automation }) =>
      automationToDashboardJob(
        automation,
        skippedAutomationIds.has(automation.id) ||
          isAutomationSkippedToday(automation.id),
      ),
    );

    const { inProgress, completed, nextUp } = partitionProjectsForToday(
      projects.filter((project) => !skippedProjectIds.has(project.id) && !isProjectSkippedToday(project.id)),
    );

    return {
      automationJobs: sortAutomationJobs(todaysAutomations),
      inProgress,
      completed,
      nextUp,
    };
  }, [automations, projects, refreshKey]);

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  return (
    <section aria-labelledby="today-dashboard-heading" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="today-dashboard-heading" className="text-title text-foreground">
            {ui.todayDashboard.title}
          </h2>
          <p className="mt-1 text-body text-[var(--foreground-muted)]">
            {ui.todayDashboard.subtitle}
          </p>
        </div>
        <Link href="/automations?create=1&destination=x">
          <Button variant="secondary" size="sm">
            {ui.habits.addHabit}
          </Button>
        </Link>
      </div>

      <Card padding="lg" className="space-y-8 shadow-[var(--shadow-soft)]">
        <DashboardSection
          title={ui.todayDashboard.sections.automations}
          jobs={automationJobs}
          emptyMessage={ui.home.todaysAutomationsEmpty}
          onSkip={handleRefresh}
          onRefresh={handleRefresh}
        />

        <div className="border-t border-[var(--border-subtle)] pt-8">
          <ProactiveSuggestionsPanel automations={automations} embedded />
        </div>

        <div className="grid gap-8 border-t border-[var(--border-subtle)] pt-8 lg:grid-cols-2">
          <DashboardSection
            title={ui.todayDashboard.sections.inProgress}
            jobs={inProgress}
            emptyMessage={ui.todayDashboard.empty.inProgress}
            onSkip={handleRefresh}
            onRefresh={handleRefresh}
          />
          <DashboardSection
            title={ui.todayDashboard.sections.nextUp}
            jobs={nextUp}
            emptyMessage={ui.todayDashboard.empty.nextUp}
            onSkip={handleRefresh}
            onRefresh={handleRefresh}
          />
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-8">
          <DashboardSection
            title={ui.todayDashboard.sections.completed}
            jobs={completed}
            emptyMessage={ui.todayDashboard.empty.completed}
            onSkip={handleRefresh}
            onRefresh={handleRefresh}
          />
        </div>
      </Card>
    </section>
  );
}
