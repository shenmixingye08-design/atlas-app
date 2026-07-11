import type { MonitorTargetId } from "@/lib/owner/monitoring/types";
import type { MaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";

export type DrTargetId = MonitorTargetId | "api" | "projects" | "settings";

export type DrFallbackMode = "none" | "degraded" | "offline" | "maintenance";

export type DrQueueJobStatus =
  | "queued"
  | "retrying"
  | "succeeded"
  | "dead"
  | "fallback";

export type DrQueueJobKind =
  | "openai"
  | "stripe"
  | "supabase"
  | "cron"
  | "commander"
  | "automation"
  | "generic";

export type DrQueueJob = {
  id: string;
  kind: DrQueueJobKind;
  targetId: DrTargetId;
  message: string;
  userId: string | null;
  source: string | null;
  attempts: number;
  maxAttempts: number;
  status: DrQueueJobStatus;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError: string | null;
};

export type DrFallbackState = {
  targetId: DrTargetId;
  mode: DrFallbackMode;
  reason: string;
  updatedAt: string;
};

export type DrBackupSection =
  | "projects"
  | "automation"
  | "learning"
  | "workMemory"
  | "notifications"
  | "billing"
  | "settings";

export type DrBackupSnapshot = {
  id: string;
  createdAt: string;
  label: string;
  sections: DrBackupSection[];
  /** Durable domain keys covered by this checkpoint. */
  domainKeys: string[];
  /** User ids discovered for restore fan-out (may be empty without Supabase). */
  userIds: string[];
  /** Operational checkpoint (queue/fallback/maintenance/billing counts). */
  payload: {
    maintenance: MaintenanceModeConfig;
    fallbacks: DrFallbackState[];
    queue: DrQueueJob[];
    billingSubscriberCount: number;
    incidentCount: number;
    notes: string;
  };
};

export type DrRecoveryEvent = {
  id: string;
  at: string;
  action:
    | "enqueue"
    | "retry"
    | "retry_success"
    | "retry_failed"
    | "fallback_on"
    | "fallback_off"
    | "maintenance_on"
    | "maintenance_off"
    | "backup"
    | "restore"
    | "graceful_error";
  targetId: DrTargetId | "platform";
  message: string;
  jobId: string | null;
};

export type DisasterRecoverySnapshot = {
  openIncidents: Array<{
    id: string;
    at: string;
    kind: string;
    targetId: string;
    message: string;
  }>;
  recovery: {
    activeFallbacks: number;
    queuedJobs: number;
    retryingJobs: number;
    deadJobs: number;
    totalRetries: number;
    maintenanceEnabled: boolean;
  };
  fallbacks: DrFallbackState[];
  queue: DrQueueJob[];
  lastBackup: DrBackupSnapshot | null;
  backups: DrBackupSnapshot[];
  recoveryHistory: DrRecoveryEvent[];
  generatedAt: string;
};
