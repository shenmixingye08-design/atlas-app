import {
  getMonitoringSnapshot,
  monitoringSnapshotToCsvBundle,
  analyticsKpisToCsv,
  healthToCsv,
  incidentsToCsv,
} from "@/lib/owner/monitoring";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { auditLogsToCsv, listOwnerAuditLogs } from "@/lib/owner/audit-log";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const section = url.searchParams.get("section") ?? "all";
  const snapshot = await getMonitoringSnapshot();

  if (format === "csv") {
    if (section === "analytics") {
      const csv = analyticsKpisToCsv([
        snapshot.analytics.today,
        snapshot.analytics.week,
        snapshot.analytics.month,
      ]);
      return csvResponse(csv, "atlas-monitoring-analytics.csv");
    }
    if (section === "health") {
      return csvResponse(
        healthToCsv(snapshot.health),
        "atlas-monitoring-health.csv",
      );
    }
    if (section === "incidents") {
      return csvResponse(
        incidentsToCsv(snapshot.incidents),
        "atlas-monitoring-incidents.csv",
      );
    }
    if (section === "audit") {
      const audit = await listOwnerAuditLogs({
        result: "failure",
        limit: 1000,
      });
      return csvResponse(
        auditLogsToCsv(audit.entries),
        "atlas-monitoring-audit-failures.csv",
      );
    }
    return csvResponse(
      monitoringSnapshotToCsvBundle(snapshot),
      "atlas-monitoring.csv",
    );
  }

  return Response.json(snapshot);
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
