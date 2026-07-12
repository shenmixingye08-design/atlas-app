import "server-only";

import { ensureAuditLogHydrated } from "@/lib/owner/audit-log";

import { buildAnalyticsKpis, buildAnalyticsSeries } from "./analytics";
import { buildMonitorHealth } from "./health";
import { listMonitoringIncidents } from "./store";
import type { MonitoringSnapshot } from "./types";

export async function getMonitoringSnapshot(
  now: Date = new Date(),
): Promise<MonitoringSnapshot> {
  await ensureAuditLogHydrated();
  const { ensureMonitoringHydrated } = await import("./durable");
  await ensureMonitoringHydrated();

  const health = buildMonitorHealth(now);
  const series = buildAnalyticsSeries(now);

  return {
    health,
    okCount: health.filter((h) => h.level === "ok").length,
    warnCount: health.filter((h) => h.level === "warn").length,
    downCount: health.filter((h) => h.level === "down").length,
    analytics: {
      today: buildAnalyticsKpis("today", now),
      week: buildAnalyticsKpis("week", now),
      month: buildAnalyticsKpis("month", now),
    },
    series,
    incidents: listMonitoringIncidents().slice(0, 50),
    generatedAt: now.toISOString(),
  };
}
