import "server-only";

import { listMonitoringIncidents } from "@/lib/owner/monitoring";
import { getMaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";

import { getLastDisasterBackup } from "./backup";
import { ensureDisasterRecoveryHydrated } from "./durable";
import { countDrQueue } from "./queue";
import {
  getDrTotalRetries,
  listDrBackups,
  listDrFallbacks,
  listDrQueueJobs,
  listDrRecoveryEvents,
} from "./store";
import type { DisasterRecoverySnapshot } from "./types";

export async function getDisasterRecoverySnapshot(): Promise<DisasterRecoverySnapshot> {
  await ensureDisasterRecoveryHydrated();

  const queueCounts = countDrQueue();
  const maintenance = getMaintenanceModeConfig();
  const incidents = listMonitoringIncidents().slice(0, 30);

  return {
    openIncidents: incidents.map((row) => ({
      id: row.id,
      at: row.at,
      kind: row.kind,
      targetId: row.targetId,
      message: row.message,
    })),
    recovery: {
      activeFallbacks: listDrFallbacks().filter((f) => f.mode !== "none")
        .length,
      queuedJobs: queueCounts.queued,
      retryingJobs: queueCounts.retrying,
      deadJobs: queueCounts.dead,
      totalRetries: getDrTotalRetries(),
      maintenanceEnabled: maintenance.enabled,
    },
    fallbacks: listDrFallbacks(),
    queue: listDrQueueJobs().slice(0, 100),
    lastBackup: getLastDisasterBackup(),
    backups: listDrBackups().slice(0, 10),
    recoveryHistory: listDrRecoveryEvents().slice(0, 100),
    generatedAt: new Date().toISOString(),
  };
}
