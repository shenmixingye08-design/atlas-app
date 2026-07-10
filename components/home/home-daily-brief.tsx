"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { runAutomationNow } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import {
  buildDailyBrief,
  getEmployeeStatusLabel,
  type DailyBrief,
  type DailyBriefScheduledItem,
} from "@/lib/home/daily-brief";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";

type HomeDailyBriefProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion?: number;
  onAutomationRun?: () => void;
};

function YesterdayCard({ brief }: { brief: DailyBrief }) {
  const { yesterday } = brief;

  if (!yesterday.hasData) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">
        {ui.dailyBrief.yesterdayEmpty}
      </p>
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
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between rounded-[var(--radius-lg)] bg-white/60 px-3 py-2.5"
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

function ScheduledItemRow({
  item,
  running,
  onRun,
}: {
  item: DailyBriefScheduledItem;
  running: boolean;
  onRun: (item: DailyBriefScheduledItem) => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-xl" aria-hidden>
          {item.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{item.subtitle}</p>
        </div>
      </div>
      {item.automationId ? (
        <Button
          variant="primary"
          size="sm"
          className="shrink-0"
          isLoading={running}
          onClick={() => onRun(item)}
        >
          {ui.dailyBrief.runNow}
        </Button>
      ) : item.href ? (
        <Link href={item.href}>
          <Button variant="secondary" size="sm" className="shrink-0">
            {ui.dailyBrief.open}
          </Button>
        </Link>
      ) : null}
    </li>
  );
}

export function HomeDailyBrief({
  automations,
  projects,
  profileVersion = 0,
  onAutomationRun,
}: HomeDailyBriefProps) {
  const [runningId, setRunningId] = useState<string | null>(null);

  const brief = useMemo(() => {
    void profileVersion;
    return buildDailyBrief({ automations, projects });
  }, [automations, projects, profileVersion]);

  const greeting = ui.dailyBrief.greeting[brief.greetingPeriod];

  const handleRun = async (item: DailyBriefScheduledItem) => {
    if (!item.automationId) return;
    setRunningId(item.automationId);
    try {
      await runAutomationNow(item.automationId);
      onAutomationRun?.();
    } finally {
      setRunningId(null);
    }
  };

  return (
    <section
      aria-labelledby="daily-brief-heading"
      className="animate-fade-up landing-glass overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-md)]"
    >
      <div className="border-b border-[var(--border-subtle)] bg-white/50 px-5 py-5 sm:px-8 sm:py-6">
        <p className="text-xs font-medium text-accent">{ui.dailyBrief.badge}</p>
        <h2
          id="daily-brief-heading"
          className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {ui.dailyBrief.title}
        </h2>
        <p className="mt-4 text-lg font-medium text-foreground">{greeting}</p>
        <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">
          {brief.headline}
        </p>
      </div>

      <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {ui.dailyBrief.yesterdayTitle}
          </h3>
          <div className="mt-3">
            <YesterdayCard brief={brief} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {ui.dailyBrief.todayTitle}
          </h3>
          {brief.todayScheduled.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--foreground-muted)]">
              {ui.dailyBrief.todayEmpty}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {brief.todayScheduled.map((item) => (
                <ScheduledItemRow
                  key={item.id}
                  item={item}
                  running={runningId === item.automationId}
                  onRun={(target) => void handleRun(target)}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {ui.dailyBrief.employeesTitle}
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {brief.employees.map((employee) => (
              <li
                key={employee.id}
                className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/70 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      {employee.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {employee.role}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      employee.status === "active"
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success)]"
                        : employee.status === "reviewing"
                          ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                          : "bg-[var(--status-neutral-bg)] text-[var(--foreground-muted)]",
                    )}
                  >
                    {getEmployeeStatusLabel(employee.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                  {ui.dailyBrief.employeeTasks(employee.todayTasks)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {brief.recommendations.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {ui.dailyBrief.recommendationsTitle}
            </h3>
            <ul className="mt-3 space-y-2">
              {brief.recommendations.map((rec) => (
                <li key={rec.id}>
                  <Link
                    href={rec.href}
                    className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/70 px-4 py-3 transition-colors hover:bg-[var(--background-subtle)]"
                  >
                    <span className="text-lg" aria-hidden>
                      {rec.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground">{rec.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-xl)] bg-[var(--accent-muted)] px-4 py-4">
            <p className="text-xs font-medium text-accent">{ui.dailyBrief.tipLabel}</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{brief.dailyTip}</p>
          </div>
          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/60 px-4 py-4">
            <p className="text-xs font-medium text-[var(--foreground-muted)]">
              {ui.dailyBrief.learningLabel}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {brief.learningInsight}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
