import "server-only";

import { randomUUID } from "crypto";

import { schedulePersistAuditLog } from "@/lib/owner/audit-log/durable";
import { sanitizeAuditReason } from "@/lib/owner/audit-log/sanitize";
import { prependAuditLogEntry } from "@/lib/owner/audit-log/store";
import { notifyOwnerSystemIncident } from "@/lib/notifications/emitters";
import {
  recordServiceHealthFailure,
  recordServiceHealthSuccess,
} from "@/lib/owner/system-status/telemetry";
import type { SystemServiceId } from "@/lib/owner/system-status/types";

import {
  appendMonitoringIncident,
  recordCronTickFailure,
  recordCronTickSuccess,
} from "./store";
import type { MonitorTargetId, RecordIncidentInput } from "./types";
import { handleDisasterIncident } from "@/lib/owner/disaster-recovery/policy";

const TARGET_TO_SYSTEM: Partial<Record<MonitorTargetId, SystemServiceId>> = {
  openai: "openai",
  stripe: "stripe",
  google: "google",
  dropbox: "dropbox",
  billing: "stripe",
};

function auditCategoryFor(
  targetId: MonitorTargetId | "api",
): "billing" | "integration" | "automation" | "commander" | "owner" | "other" {
  switch (targetId) {
    case "stripe":
    case "billing":
      return "billing";
    case "google":
    case "dropbox":
    case "line":
      return "integration";
    case "automation":
    case "cron":
      return "automation";
    case "commander":
      return "commander";
    default:
      return "owner";
  }
}

/**
 * Record an operational incident → monitoring store + audit log + owner alert.
 */
export function recordMonitoringIncident(input: RecordIncidentInput): void {
  const critical = input.critical ?? true;
  appendMonitoringIncident({
    at: new Date().toISOString(),
    kind: input.kind,
    targetId: input.targetId,
    message: input.message.slice(0, 500),
    notified: critical,
  });

  prependAuditLogEntry({
    id: `aud_${randomUUID()}`,
    at: new Date().toISOString(),
    userId: input.userId ?? null,
    email: null,
    ip: null,
    userAgent: null,
    category: auditCategoryFor(input.targetId),
    action: sanitizeAuditReason(input.kind) ?? "incident",
    targetId: input.targetId,
    result: "failure",
    reason: sanitizeAuditReason(input.message),
  });
  schedulePersistAuditLog();
  handleDisasterIncident(input);

  if (input.targetId !== "api") {
    const systemId = TARGET_TO_SYSTEM[input.targetId];
    if (systemId) {
      recordServiceHealthFailure(systemId, input.source ?? input.kind);
    }
  }

  if (critical) {
    notifyOwnerSystemIncident(
      `[${input.kind}] ${input.message}`.slice(0, 400),
    );
    // Best-effort LINE / email: channels are used when integration is configured
    // via existing notification prefs / LINE Messaging (owner in-app is primary).
    void import("@/lib/integrations/line/messaging")
      .then(async ({ pushLineTextMessage }) => {
        const ownerLineUserId = process.env.ATLAS_OWNER_LINE_USER_ID?.trim();
        if (!ownerLineUserId) return;
        if (!process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()) return;
        await pushLineTextMessage({
          lineUserId: ownerLineUserId,
          text: `【ATLAS障害】${input.kind}\n${input.message}`.slice(0, 900),
        });
      })
      .catch(() => {
        // optional channel
      });
  }
}

export function recordCronTickOutcome(
  success: boolean,
  message?: string,
): void {
  if (success) {
    recordCronTickSuccess();
    recordServiceHealthSuccess("server", "automation_tick");
    return;
  }
  recordCronTickFailure(message ?? "Cron tick failed");
  recordMonitoringIncident({
    kind: "cron_stopped",
    targetId: "cron",
    message: message ?? "Cron tick failed",
    critical: true,
    source: "automation_tick",
  });
}
