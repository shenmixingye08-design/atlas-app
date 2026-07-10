"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import {
  buildDailyBrief,
  getEmployeeStatusLabel,
  type DailyBrief,
} from "@/lib/home/daily-brief";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type SectionProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion?: number;
};

function useBrief({ automations, projects, profileVersion = 0 }: SectionProps) {
  return useMemo(() => {
    void profileVersion;
    return buildDailyBrief({ automations, projects });
  }, [automations, projects, profileVersion]);
}

function YesterdayContent({ brief }: { brief: DailyBrief }) {
  const { yesterday } = brief;

  if (!yesterday.hasData) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{ui.dailyBrief.yesterdayEmpty}</p>
    );
  }

  const rows = [
    { icon: "📱", label: ui.dailyBrief.categories.sns, value: yesterday.sns },
    { icon: "📝", label: ui.dailyBrief.categories.blog, value: yesterday.blog },
    { icon: "📄", label: ui.dailyBrief.categories.sales, value: yesterday.sales },
    { icon: "📧", label: ui.dailyBrief.categories.email, value: yesterday.email },
    { icon: "🔁", label: ui.dailyBrief.categories.automation, value: yesterday.automations },
    { icon: "⏱", label: ui.dailyBrief.categories.hoursSaved, value: yesterday.hoursSaved },
  ].filter((row) => row.value > 0 || row.label === ui.dailyBrief.categories.hoursSaved);

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2.5"
        >
          <span className="flex items-center gap-2 text-sm text-foreground">
            <span aria-hidden>{row.icon}</span>
            {row.label}
          </span>
          <span className="text-sm font-semibold text-accent">
            {row.label === ui.dailyBrief.categories.hoursSaved
              ? ui.dailyBrief.hoursValue(row.value)
              : row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HomeYesterdaySection(props: SectionProps) {
  const brief = useBrief(props);
  return <YesterdayContent brief={brief} />;
}

export function HomeEmployeesSection(props: SectionProps) {
  const brief = useBrief(props);

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {brief.employees.map((employee) => (
        <li
          key={employee.id}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                {employee.icon}
              </span>
              <span className="text-sm font-medium text-foreground">{employee.role}</span>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                employee.status === "active"
                  ? "bg-[var(--success-bg)] text-[var(--success)]"
                  : employee.status === "reviewing"
                    ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                    : "bg-[var(--status-neutral-bg)] text-[var(--text-muted)]",
              )}
            >
              {getEmployeeStatusLabel(employee.status)}
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {ui.dailyBrief.employeeTasks(employee.todayTasks)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function HomeBriefRecommendationsSection(props: SectionProps) {
  const brief = useBrief(props);

  if (brief.recommendations.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{ui.homeUx.recommendationsEmpty}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {brief.recommendations.map((rec) => (
        <li key={rec.id}>
          <Link
            href={rec.href}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 transition-colors duration-[var(--motion-base)] hover:bg-[var(--card)]"
          >
            <span className="text-lg" aria-hidden>
              {rec.icon}
            </span>
            <span className="text-sm font-medium text-foreground">{rec.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HomeLearningSection(props: SectionProps) {
  const brief = useBrief(props);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-[var(--radius-lg)] bg-[var(--accent-muted)] px-4 py-4">
        <p className="text-xs font-medium text-accent">{ui.dailyBrief.tipLabel}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{brief.dailyTip}</p>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          {ui.dailyBrief.learningLabel}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {brief.learningInsight}
        </p>
      </div>
    </div>
  );
}
