import "server-only";

import type {
  AutomationCronDebugSnapshot,
  AutomationExecutionLogEntry,
} from "./types";

const MAX_LOGS = 500;

type Bucket = {
  logs: AutomationExecutionLogEntry[];
  cron: AutomationCronDebugSnapshot;
};

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationExecutionLogs?: Bucket;
  };
  if (!scope.__atlasAutomationExecutionLogs) {
    scope.__atlasAutomationExecutionLogs = {
      logs: [],
      cron: {
        lastTickAt: null,
        lastTickOk: null,
        lastTickError: null,
        dueCount: 0,
        successCount: 0,
        failureCount: 0,
      },
    };
  }
  return scope.__atlasAutomationExecutionLogs;
}

export function recordAutomationExecutionLog(
  entry: Omit<AutomationExecutionLogEntry, "id"> & { id?: string },
): AutomationExecutionLogEntry {
  const bucket = getBucket();
  const row: AutomationExecutionLogEntry = {
    id: entry.id ?? crypto.randomUUID(),
    automationId: entry.automationId,
    userId: entry.userId,
    scheduledAt: entry.scheduledAt,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    status: entry.status,
    generatedText: entry.generatedText,
    xPostId: entry.xPostId,
    xPostUrl: entry.xPostUrl,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    retryCount: entry.retryCount,
    xApiSummary: entry.xApiSummary,
    triggerType: entry.triggerType,
  };
  bucket.logs = [row, ...bucket.logs].slice(0, MAX_LOGS);
  return row;
}

export function updateAutomationExecutionLog(
  id: string,
  patch: Partial<AutomationExecutionLogEntry>,
): AutomationExecutionLogEntry | null {
  const bucket = getBucket();
  const index = bucket.logs.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const updated = { ...bucket.logs[index], ...patch, id };
  bucket.logs[index] = updated;
  return updated;
}

export function listAutomationExecutionLogs(options?: {
  automationId?: string;
  limit?: number;
}): AutomationExecutionLogEntry[] {
  const bucket = getBucket();
  const limit = options?.limit ?? 100;
  return bucket.logs
    .filter((row) =>
      options?.automationId ? row.automationId === options.automationId : true,
    )
    .slice(0, limit);
}

export function recordAutomationCronDebug(input: {
  ok: boolean;
  error?: string | null;
  dueCount?: number;
  successCount?: number;
  failureCount?: number;
}): void {
  const bucket = getBucket();
  bucket.cron = {
    lastTickAt: new Date().toISOString(),
    lastTickOk: input.ok,
    lastTickError: input.error ?? null,
    dueCount: input.dueCount ?? bucket.cron.dueCount,
    successCount: input.successCount ?? bucket.cron.successCount,
    failureCount: input.failureCount ?? bucket.cron.failureCount,
  };
}

export function getAutomationCronDebugSnapshot(): AutomationCronDebugSnapshot {
  return { ...getBucket().cron };
}
