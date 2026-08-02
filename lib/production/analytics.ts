import "server-only";

import { listAuditLogEntries } from "@/lib/owner/audit-log";

export type ProductAnalyticsSnapshot = {
  dau: number;
  wau: number;
  mau: number;
  retentionDay7Estimate: number | null;
  retentionDay14Estimate: number | null;
  retentionDay30Estimate: number | null;
  activationCompletions: number;
  automationUtilizationPercent: number;
  deliverableUtilizationPercent: number;
  memoryUtilizationPercent: number;
  generatedAt: string;
  isEstimated: boolean;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function uniqueUsersBetween(from: Date, to: Date): Set<string> {
  const set = new Set<string>();
  for (const row of listAuditLogEntries()) {
    if (!row.userId) continue;
    const t = new Date(row.at).getTime();
    if (t >= from.getTime() && t <= to.getTime()) set.add(row.userId);
  }
  return set;
}

function countActions(actions: string[], from: Date, to: Date): number {
  return listAuditLogEntries().filter((row) => {
    if (!actions.includes(row.action)) return false;
    const t = new Date(row.at).getTime();
    return t >= from.getTime() && t <= to.getTime();
  }).length;
}

/**
 * Product analytics for ops — DAU/WAU/MAU from audit activity.
 * Activation events are best-effort (in-memory buffer when available).
 */
export function getProductAnalyticsSnapshot(
  now: Date = new Date(),
): ProductAnalyticsSnapshot {
  const todayStart = startOfUtcDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setUTCDate(monthStart.getUTCDate() - 29);

  const dauUsers = uniqueUsersBetween(todayStart, now);
  const wauUsers = uniqueUsersBetween(weekStart, now);
  const mauUsers = uniqueUsersBetween(monthStart, now);

  const automationActions = countActions(
    ["automation_create", "automation_update", "automation_run", "automation"],
    monthStart,
    now,
  );
  const deliverableActions = countActions(
    ["deliverable_generate", "deliverable_download", "export_word", "export_pdf"],
    monthStart,
    now,
  );
  const memoryActions = countActions(
    ["memory_update", "memory_create", "personal_memory"],
    monthStart,
    now,
  );

  const activationCompletions = countActions(
    ["signup_completed", "first_experience_completed", "activation_completed"],
    monthStart,
    now,
  );

  const active = Math.max(mauUsers.size, 1);

  // Rough retention: share of early-window users also seen around day 7 — estimate only.
  const early = uniqueUsersBetween(monthStart, new Date(monthStart.getTime() + 7 * 86400000));
  const late7 = uniqueUsersBetween(
    new Date(monthStart.getTime() + 6 * 86400000),
    new Date(monthStart.getTime() + 8 * 86400000),
  );
  const retained7 = [...early].filter((u) => late7.has(u)).length;

  return {
    dau: dauUsers.size,
    wau: wauUsers.size,
    mau: mauUsers.size,
    retentionDay7Estimate:
      early.size > 0 ? Math.round((retained7 / early.size) * 1000) / 10 : null,
    retentionDay14Estimate: null,
    retentionDay30Estimate: null,
    activationCompletions,
    automationUtilizationPercent: Math.min(
      100,
      Math.round((automationActions / active) * 10) / 10,
    ),
    deliverableUtilizationPercent: Math.min(
      100,
      Math.round((deliverableActions / active) * 10) / 10,
    ),
    memoryUtilizationPercent: Math.min(
      100,
      Math.round((memoryActions / active) * 10) / 10,
    ),
    generatedAt: now.toISOString(),
    isEstimated: true,
  };
}
