import type {
  DisasterRecoverySnapshot,
  DrRecoveryEvent,
} from "./types";
import { listMonitoringIncidents } from "@/lib/owner/monitoring";

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

export function disasterIncidentsToCsv(): string {
  const rows = listMonitoringIncidents();
  return rowsToCsv(
    ["id", "at", "kind", "targetId", "message", "notified"],
    rows.map((r) => [r.id, r.at, r.kind, r.targetId, r.message, r.notified]),
  );
}

export function disasterRecoveryHistoryToCsv(
  events: readonly DrRecoveryEvent[],
): string {
  return rowsToCsv(
    ["id", "at", "action", "targetId", "message", "jobId"],
    events.map((r) => [r.id, r.at, r.action, r.targetId, r.message, r.jobId]),
  );
}

export function disasterRecoverySnapshotToCsv(
  snapshot: DisasterRecoverySnapshot,
): string {
  return [
    "# incidents",
    disasterIncidentsToCsv().trimEnd(),
    "",
    "# recovery",
    disasterRecoveryHistoryToCsv(snapshot.recoveryHistory).trimEnd(),
    "",
  ].join("\n");
}
