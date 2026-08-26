import type { UsageLimitSummary } from "@/lib/billing/usage/types";

import type { MeasuredValueView } from "./types";

export function previousUsageMonthKey(month: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMeasuredValueView(input: {
  usage: UsageLimitSummary;
  previousMonthAiRuns?: number | null;
  previousMonthKnown?: boolean;
}): MeasuredValueView {
  const ready = input.usage.ready !== false;
  return {
    completedJobs: null,
    automationSuccesses: null,
    deliverables: null,
    xPosts: ready ? input.usage.snsPosts.used : null,
    usageThisMonth: ready ? input.usage.aiRuns.used : null,
    activeAutomations: ready ? input.usage.automationTasks.used : null,
    previousMonthJobs: input.previousMonthKnown ? (input.previousMonthAiRuns ?? null) : null,
  };
}
