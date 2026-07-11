import "server-only";

import { randomUUID } from "crypto";

import { listUserSubscriptions } from "@/lib/billing/subscriptions/store";
import { listMonitoringIncidents } from "@/lib/owner/monitoring";
import {
  getMaintenanceModeConfig,
  setMaintenanceModeConfig,
} from "@/lib/owner/system-status/maintenance";
import {
  listSupabaseUserIdsForDomain,
} from "@/lib/persistence/supabase-user-state";
import {
  AUTOMATIONS_DOMAIN_KEY,
  listAutomationOwnerUserIds,
} from "@/lib/automations/global-durable";

import {
  getDrBackup,
  listDrBackups,
  listDrFallbacks,
  listDrQueueJobs,
  prependDrBackup,
  prependDrRecoveryEvent,
  replaceDrState,
} from "./store";
import type { DrBackupSection, DrBackupSnapshot } from "./types";

/** Domains that durable persistence already backs up (reuse). */
export const DR_BACKUP_DOMAIN_KEYS = [
  "atlasAutomations",
  "atlasWorkMemory",
  "atlasLearning",
  "atlasNotifications",
  "atlasCommanderRuns",
  "atlasExternalAuth",
  "atlasLineLink",
  "atlasBilling",
] as const;

const DEFAULT_SECTIONS: DrBackupSection[] = [
  "projects",
  "automation",
  "learning",
  "workMemory",
  "notifications",
  "billing",
  "settings",
];

export async function createDisasterBackup(input?: {
  label?: string;
  sections?: DrBackupSection[];
}): Promise<DrBackupSnapshot> {
  const sections = input?.sections ?? DEFAULT_SECTIONS;
  const automationUsers = await listAutomationOwnerUserIds().catch(() => []);
  const workMemoryUsers = await listSupabaseUserIdsForDomain(
    "atlasWorkMemory",
  ).catch(() => []);
  const learningUsers = await listSupabaseUserIdsForDomain("atlasLearning").catch(
    () => [],
  );
  const notificationUsers = await listSupabaseUserIdsForDomain(
    "atlasNotifications",
  ).catch(() => []);

  const userIds = [
    ...new Set([
      ...automationUsers,
      ...workMemoryUsers,
      ...learningUsers,
      ...notificationUsers,
    ]),
  ].filter((id) => !id.startsWith("__"));

  const snapshot: DrBackupSnapshot = {
    id: `drb_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    label: input?.label ?? "Platform checkpoint",
    sections,
    domainKeys: [...DR_BACKUP_DOMAIN_KEYS],
    userIds: userIds.slice(0, 500),
    payload: {
      maintenance: getMaintenanceModeConfig(),
      fallbacks: listDrFallbacks(),
      queue: listDrQueueJobs(),
      billingSubscriberCount: listUserSubscriptions().length,
      incidentCount: listMonitoringIncidents().length,
      notes: [
        "Projects/Automation/Learning/Work Memory/Notifications は既存 durable（Clerk/Supabase）が正本。",
        "本スナップショットは運用状態（Queue/Fallback/Maintenance）と復元対象ユーザー一覧を保存します。",
        `automationsDomain=${AUTOMATIONS_DOMAIN_KEY}`,
      ].join(" "),
    },
  };

  prependDrBackup(snapshot);
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: snapshot.createdAt,
    action: "backup",
    targetId: "platform",
    message: `Backup ${snapshot.id} (${snapshot.userIds.length} users)`,
    jobId: null,
  });

  const { schedulePersistDisasterRecovery } = await import("./durable");
  schedulePersistDisasterRecovery();

  return snapshot;
}

/**
 * Restore operational DR state from a checkpoint.
 * Durable user domains remain in Clerk/Supabase — this restores queue/fallback/maintenance.
 */
export function restoreDisasterBackup(backupId: string): DrBackupSnapshot {
  const snapshot = getDrBackup(backupId);
  if (!snapshot) {
    throw new Error("Backup not found");
  }

  replaceDrState({
    queue: snapshot.payload.queue,
    fallbacks: snapshot.payload.fallbacks,
  });
  setMaintenanceModeConfig({
    enabled: snapshot.payload.maintenance.enabled,
    message: snapshot.payload.maintenance.message,
    estimatedRecoveryAt: snapshot.payload.maintenance.estimatedRecoveryAt,
    announcement: snapshot.payload.maintenance.announcement,
  });

  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: new Date().toISOString(),
    action: "restore",
    targetId: "platform",
    message: `Restored ${snapshot.id}`,
    jobId: null,
  });

  return snapshot;
}

export function getLastDisasterBackup(): DrBackupSnapshot | null {
  return listDrBackups()[0] ?? null;
}
