"use client";

import { useMemo, useState } from "react";

import { getTodaysAutomations } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  sortAutomationJobs,
} from "@/lib/home/today-dashboard";
import {
  getSkippedAutomationIds,
  isAutomationSkippedToday,
} from "@/lib/home/today-skipped-store";
import { ui } from "@/lib/i18n";

import { HomeTodayWorkCard } from "./home-today-work-card";

type HomeTodayWorkPanelProps = {
  automations: Automation[];
};

export function HomeTodayWorkPanel({ automations }: HomeTodayWorkPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const jobs = useMemo(() => {
    try {
      void refreshKey;
      const automationsSafe = normalizeAutomations(automations);
      const skippedAutomationIds = new Set(getSkippedAutomationIds());

      const todaysAutomations = getTodaysAutomations(automationsSafe).map(
        ({ automation }) =>
          automationToDashboardJob(
            automation,
            skippedAutomationIds.has(automation.id) ||
              isAutomationSkippedToday(automation.id),
          ),
      );

      return sortAutomationJobs(todaysAutomations).filter(
        (job) => job.status !== "completed" && job.status !== "skipped",
      );
    } catch (error) {
      console.error("[HomeTodayWorkPanel]", error);
      return [];
    }
  }, [automations, refreshKey]);

  return (
    <section aria-labelledby="today-work-heading" className="space-y-6">
      <div>
        <h2 id="today-work-heading" className="text-xl font-semibold text-foreground">
          {ui.todayDashboard.title}
        </h2>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-10 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.todayDashboard.empty.todayWork}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => (
            <HomeTodayWorkCard
              key={job.id}
              job={job}
              onRefresh={() => setRefreshKey((value) => value + 1)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
