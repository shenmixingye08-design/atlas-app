import type {
  AnalyticsKpis,
  AnalyticsSeriesPoint,
  MonitorTargetSnapshot,
  MonitoringIncident,
  MonitoringSnapshot,
} from "./types";

function escapeCsv(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  return `${[
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n")}\n`;
}

export function healthToCsv(rows: readonly MonitorTargetSnapshot[]): string {
  return rowsToCsv(
    ["id", "label", "level", "detail", "lastCheckedAt"],
    rows.map((r) => [r.id, r.label, r.level, r.detail, r.lastCheckedAt]),
  );
}

export function analyticsKpisToCsv(kpis: readonly AnalyticsKpis[]): string {
  return rowsToCsv(
    [
      "period",
      "activeUsers",
      "totalUsers",
      "activeRatePercent",
      "aiRuns",
      "automationRuns",
      "commanderRuns",
      "notificationCount",
      "stripeRevenueJpy",
      "openAiCostJpy",
      "profitForecastJpy",
      "apiErrorRatePercent",
      "avgResponseMs",
      "isEstimated",
    ],
    kpis.map((k) => [
      k.period,
      k.activeUsers,
      k.totalUsers,
      k.activeRatePercent,
      k.aiRuns,
      k.automationRuns,
      k.commanderRuns,
      k.notificationCount,
      k.stripeRevenueJpy,
      k.openAiCostJpy,
      k.profitForecastJpy,
      k.apiErrorRatePercent,
      k.avgResponseMs,
      k.isEstimated,
    ]),
  );
}

export function seriesToCsv(points: readonly AnalyticsSeriesPoint[]): string {
  return rowsToCsv(
    [
      "key",
      "label",
      "aiRuns",
      "automationRuns",
      "commanderRuns",
      "errors",
      "revenueJpy",
      "openAiCostJpy",
    ],
    points.map((p) => [
      p.key,
      p.label,
      p.aiRuns,
      p.automationRuns,
      p.commanderRuns,
      p.errors,
      p.revenueJpy,
      p.openAiCostJpy,
    ]),
  );
}

export function incidentsToCsv(rows: readonly MonitoringIncident[]): string {
  return rowsToCsv(
    ["id", "at", "kind", "targetId", "message", "notified"],
    rows.map((r) => [r.id, r.at, r.kind, r.targetId, r.message, r.notified]),
  );
}

export function monitoringSnapshotToCsvBundle(
  snapshot: MonitoringSnapshot,
): string {
  const parts = [
    "# health",
    healthToCsv(snapshot.health).trimEnd(),
    "",
    "# analytics",
    analyticsKpisToCsv([
      snapshot.analytics.today,
      snapshot.analytics.week,
      snapshot.analytics.month,
    ]).trimEnd(),
    "",
    "# series_daily",
    seriesToCsv(snapshot.series.daily).trimEnd(),
    "",
    "# incidents",
    incidentsToCsv(snapshot.incidents).trimEnd(),
    "",
  ];
  return `${parts.join("\n")}\n`;
}
