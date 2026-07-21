"use client";

import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { computeTodayOutcomes } from "@/lib/home/today-outcomes";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeTodayOutcomesProps = {
  automations: Automation[];
  projects: Project[];
};

export function HomeTodayOutcomes({ automations, projects }: HomeTodayOutcomesProps) {
  const stats = useMemo(() => {
    try {
      return computeTodayOutcomes(
        normalizeProjects(projects),
        normalizeAutomations(automations),
      );
    } catch (error) {
      console.error("[HomeTodayOutcomes]", error);
      return {
        completedTasks: 0,
        aiRunning: 0,
        hoursSaved: 0,
        snsPosts: 0,
        emailSent: 0,
        materialsGenerated: 0,
      };
    }
  }, [automations, projects]);

  const metrics = [
    {
      key: "completedTasks",
      label: ui.secretaryHome.outcomeCompletedTasks,
      value: stats.completedTasks,
      unit: ui.secretaryHome.unitTasks,
    },
    {
      key: "aiRunning",
      label: ui.secretaryHome.outcomeAiRunning,
      value: stats.aiRunning,
      unit: ui.secretaryHome.unitTasks,
    },
    {
      key: "hoursSaved",
      label: ui.secretaryHome.outcomeHoursSaved,
      value: stats.hoursSaved,
      unit: ui.secretaryHome.unitHours,
    },
    {
      key: "snsPosts",
      label: ui.secretaryHome.outcomePosts,
      value: stats.snsPosts,
      unit: ui.secretaryHome.unitItems,
    },
    {
      key: "emailSent",
      label: ui.secretaryHome.outcomeEmails,
      value: stats.emailSent,
      unit: ui.secretaryHome.unitItems,
    },
    {
      key: "materialsGenerated",
      label: ui.secretaryHome.outcomeMaterials,
      value: stats.materialsGenerated,
      unit: ui.secretaryHome.unitItems,
    },
  ];

  const hasAnyOutcome =
    metrics.some((metric) => metric.value > 0) || stats.aiRunning > 0;

  return (
    <section aria-labelledby="today-outcomes-heading" className="space-y-5">
      <div>
        <h2
          id="today-outcomes-heading"
          className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {ui.secretaryHome.outcomesTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.secretaryHome.outcomesSubtitle}
        </p>
      </div>

      {hasAnyOutcome ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {metrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-5 shadow-[var(--shadow-sm)] sm:px-6 sm:py-6"
            >
              <dt className="text-xs text-[var(--foreground-muted)] sm:text-sm">
                {metric.label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {metric.value}
                <span className="ml-1 text-sm font-normal text-[var(--foreground-muted)]">
                  {metric.unit}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)]/60 px-8 py-10 text-center">
          <p className="text-base text-[var(--foreground-muted)]">
            {ui.secretaryHome.outcomesEmpty}
          </p>
        </div>
      )}
    </section>
  );
}
