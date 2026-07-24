"use client";

import Link from "next/link";

import type { TodayAutomationItem } from "@/lib/automations/today";
import { getExecutionLevelShortLabel } from "@/lib/automations/execution-level";
import { formatExecutionFlowSummary } from "@/lib/automations/execution-flow";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ExecutionLevelBadge } from "@/components/automations/execution-level-selector";

type TodaysAutomationsProps = {
  items: TodayAutomationItem[];
};

export function TodaysAutomations({ items }: TodaysAutomationsProps) {
  return (
    <section aria-labelledby="todays-automations-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="todays-automations-heading" className="text-title text-foreground">
            {ui.home.todaysAutomations}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.home.todaysAutomationsHint}
          </p>
        </div>
        <Link href="/automations?create=1&destination=x">
          <Button variant="secondary" size="sm">
            {ui.habits.addHabit}
          </Button>
        </Link>
      </div>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        {items.length === 0 ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-body text-[var(--foreground-muted)]">
              {ui.home.todaysAutomationsEmpty}
            </p>
            <Link href="/automations?create=1&destination=x">
              <Button variant="primary">{ui.habits.registerFirst}</Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map(({ automation, completed }) => (
              <li
                key={automation.id}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    completed
                      ? "bg-[var(--status-success)]/15 text-[var(--status-success)]"
                      : "bg-[var(--card)] text-[var(--foreground-muted)] ring-1 ring-[var(--border-subtle)]"
                  }`}
                  aria-hidden
                >
                  {completed ? "✓" : "○"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{automation.name}</p>
                  <p className="text-caption text-[var(--foreground-muted)]">
                    {automation.schedule.label}
                  </p>
                  <p className="mt-1 text-caption text-[var(--foreground-muted)]">
                    {formatExecutionFlowSummary(automation.executionFlow)}
                  </p>
                </div>
                <ExecutionLevelBadge level={automation.executionLevel} />
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <p className="mb-3 text-sm font-semibold text-foreground">
              {ui.home.todaysAutomationsRequestScope}
            </p>
            <ul className="space-y-2 text-sm">
              {items.map(({ automation }) => (
                <li
                  key={`level-${automation.id}`}
                  className="flex items-center justify-between gap-3 text-[var(--foreground-muted)]"
                >
                  <span>{automation.name}</span>
                  <span className="font-medium text-foreground">
                    {getExecutionLevelShortLabel(automation.executionLevel)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
