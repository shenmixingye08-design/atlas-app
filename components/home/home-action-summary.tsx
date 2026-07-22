"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { formatAutomationDateTime } from "@/lib/automations/client";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { computeHomeActionSummary } from "@/lib/home/action-summary";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type HomeActionSummaryProps = {
  automations: Automation[];
  projects: Project[];
};

type ActionRow = {
  key: string;
  label: string;
  count: number;
  href: string;
  accent?: "warning" | "error" | "default";
};

export function HomeActionSummary({
  automations,
  projects,
}: HomeActionSummaryProps) {
  const summary = useMemo(() => {
    try {
      return computeHomeActionSummary(
        normalizeProjects(projects),
        normalizeAutomations(automations),
      );
    } catch (error) {
      console.error("[HomeActionSummary]", error);
      return {
        approvalCount: 0,
        failureCount: 0,
        nextAutomation: null,
        recentDeliverables: [],
        todayCounts: { running: 0, completed: 0, waiting: 0, error: 0 },
      };
    }
  }, [automations, projects]);

  const rows: ActionRow[] = [];

  if (summary.approvalCount > 0) {
    rows.push({
      key: "approvals",
      label: ui.phase4.approvalsPending,
      count: summary.approvalCount,
      href: "/notifications?filter=needs_review",
      accent: "warning",
    });
  }

  if (summary.failureCount > 0) {
    rows.push({
      key: "failures",
      label: ui.phase4.failuresNeedAttention,
      count: summary.failureCount,
      href: "/notifications?filter=error",
      accent: "error",
    });
  }

  const hasRows = rows.length > 0 || summary.nextAutomation !== null;

  return (
    <section aria-labelledby="home-action-summary-heading" className="space-y-4">
      <h2 id="home-action-summary-heading" className="sr-only">
        {ui.phase4.actionSummaryTitle}
      </h2>

      {hasRows && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className={cn(
                  "flex min-h-[56px] items-center justify-between rounded-[20px] border px-5 py-4 transition-colors focus-ring",
                  row.accent === "error"
                    ? "border-[var(--error)]/25 bg-[var(--error-bg)]/40 hover:border-[var(--error)]/40"
                    : row.accent === "warning"
                      ? "border-amber-500/25 bg-amber-500/5 hover:border-amber-500/40"
                      : "border-[var(--border-subtle)] bg-[var(--card)] hover:border-accent/30",
                )}
              >
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                <span className="text-xl font-semibold tabular-nums text-foreground">
                  {row.count}
                </span>
              </Link>
            </li>
          ))}

          {summary.nextAutomation && (
            <li className="sm:col-span-2">
              <Link
                href={`/automations?focus=${encodeURIComponent(summary.nextAutomation.id)}`}
                className="flex flex-col gap-1 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 transition-colors hover:border-accent/30 focus-ring sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-foreground">
                  {ui.phase4.nextAutomation}
                </span>
                <span className="text-sm text-[var(--foreground-muted)]">
                  {summary.nextAutomation.name} ·{" "}
                  {formatAutomationDateTime(summary.nextAutomation.nextRun)}
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}

      {summary.recentDeliverables.length > 0 && (
        <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {ui.phase4.recentDeliverables}
            </p>
            <Link
              href="/deliverables"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              {ui.actions.open}
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {summary.recentDeliverables.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/projects/${item.id}`}
                  className="block truncate text-sm text-[var(--foreground-muted)] hover:text-foreground"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-[var(--foreground-muted)]">
        <Link href="/connections" className="underline-offset-2 hover:text-accent hover:underline">
          {ui.phase4.checkConnections}
        </Link>
        <span aria-hidden>·</span>
        <span>
          {ui.phase4.todayRunning(summary.todayCounts.running)} /{" "}
          {ui.phase4.todayCompleted(summary.todayCounts.completed)}
        </span>
      </div>
    </section>
  );
}
