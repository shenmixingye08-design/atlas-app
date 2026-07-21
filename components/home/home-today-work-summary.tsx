"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { computeTodayWorkSummary } from "@/lib/home/today-work-summary";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type HomeTodayWorkSummaryProps = {
  automations: Automation[];
  projects: Project[];
};

type SummaryCard = {
  key: keyof ReturnType<typeof computeTodayWorkSummary>;
  label: string;
  href?: string;
  accent?: boolean;
};

const CARD_KEYS: SummaryCard[] = [
  { key: "running", label: ui.secretaryHome.summaryRunning, accent: true },
  { key: "completed", label: ui.secretaryHome.summaryCompleted, href: "/history" },
  { key: "waiting", label: ui.secretaryHome.summaryWaiting, href: "/automations" },
  { key: "error", label: ui.secretaryHome.summaryError, href: "/history" },
];

export function HomeTodayWorkSummary({
  automations,
  projects,
}: HomeTodayWorkSummaryProps) {
  const summary = useMemo(() => {
    try {
      return computeTodayWorkSummary(
        normalizeProjects(projects),
        normalizeAutomations(automations),
      );
    } catch (error) {
      console.error("[HomeTodayWorkSummary]", error);
      return { running: 0, completed: 0, waiting: 0, error: 0 };
    }
  }, [automations, projects]);

  const isIdle = Object.values(summary).every((value) => value === 0);

  return (
    <section aria-labelledby="today-work-summary-heading" className="space-y-6">
      <div>
        <h2
          id="today-work-summary-heading"
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          {ui.secretaryHome.todayWorkTitle}
        </h2>
        <p className="mt-2 text-base text-[var(--foreground-muted)] sm:mt-3">
          {ui.secretaryHome.todayWorkSubtitle}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {CARD_KEYS.map((card) => {
          const value = summary[card.key];
          const body = (
            <div
              className={cn(
                "flex h-full flex-col justify-between rounded-[24px] border bg-[var(--card)] px-5 py-5 shadow-[var(--shadow-sm)] transition-all sm:px-6 sm:py-6",
                card.accent && value > 0
                  ? "border-accent/25 shadow-[var(--shadow-md)]"
                  : "border-[var(--border-subtle)]",
                card.href && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
              )}
            >
              <span
                className={cn(
                  "text-3xl font-semibold tracking-tight sm:text-4xl",
                  card.accent && value > 0 ? "text-accent" : "text-foreground",
                )}
              >
                {value}
              </span>
              <span className="mt-3 text-sm text-[var(--foreground-muted)]">
                {card.label}
              </span>
            </div>
          );

          return card.href ? (
            <Link key={card.key} href={card.href} className="focus-ring rounded-[24px]">
              {body}
            </Link>
          ) : (
            <div key={card.key}>{body}</div>
          );
        })}
      </div>

      {isIdle && (
        <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] px-8 py-12 text-center shadow-[var(--shadow-sm)]">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-strong)]"
            aria-hidden
          >
            <span className="h-2.5 w-2.5 rounded-full bg-accent animate-soft-pulse" />
          </span>
          <p className="mt-5 text-lg font-medium text-foreground">
            {ui.secretaryHome.deskIdleTitle}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--foreground-muted)]">
            {ui.secretaryHome.deskIdleHint}
          </p>
        </div>
      )}
    </section>
  );
}
