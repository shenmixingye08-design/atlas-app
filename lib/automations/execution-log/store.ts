import "server-only";

import { isAutomationDurableRequired } from "../automation-backend";
import {
  executionLogToDurableRow,
  listDurableAutomationExecutions,
  upsertDurableAutomationExecution,
} from "../durable-automation-executions";

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

export function resetAutomationExecutionLogStoreForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationExecutionLogs?: Bucket;
  };
  scope.__atlasAutomationExecutionLogs = undefined;
}

function durableToLog(
  row: Awaited<ReturnType<typeof listDurableAutomationExecutions>>[number],
): AutomationExecutionLogEntry {
  const payload = row.payload ?? {};
  const status: AutomationExecutionLogEntry["status"] =
    row.status === "success"
      ? "success"
      : row.status === "failed"
        ? "failed"
        : row.status === "awaiting_approval"
          ? "awaiting_approval"
          : row.status === "skipped" || row.status === "cancelled"
            ? "skipped"
            : "running";
  return {
    id: row.id,
    automationId: row.automationId,
    userId: row.ownerUserId,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt ?? row.createdAt,
    completedAt: row.finishedAt,
    status,
    generatedText: (payload.generatedText as string | null) ?? null,
    xPostId: (payload.xPostId as string | null) ?? null,
    xPostUrl: (payload.xPostUrl as string | null) ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount,
    xApiSummary: (payload.xApiSummary as string | null) ?? null,
    triggerType: row.triggerType,
  };
}

export async function recordAutomationExecutionLog(
  entry: Omit<AutomationExecutionLogEntry, "id"> & { id?: string },
): Promise<AutomationExecutionLogEntry> {
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

  // P0-6: Durable execution history write-through (fail-closed when required).
  if (isAutomationDurableRequired() && row.userId) {
    await upsertDurableAutomationExecution(executionLogToDurableRow(row));
  }

  return row;
}

export async function updateAutomationExecutionLog(
  id: string,
  patch: Partial<AutomationExecutionLogEntry>,
): Promise<AutomationExecutionLogEntry | null> {
  const bucket = getBucket();
  const index = bucket.logs.findIndex((row) => row.id === id);
  let updated: AutomationExecutionLogEntry | null = null;
  if (index >= 0) {
    updated = { ...bucket.logs[index], ...patch, id };
    bucket.logs[index] = updated;
  }

  if (isAutomationDurableRequired()) {
    const ownerId = updated?.userId ?? patch.userId;
    if (ownerId) {
      const durableRows = await listDurableAutomationExecutions({
        ownerUserId: ownerId,
        limit: 500,
      });
      const existing = durableRows.find((row) => row.id === id);
      const base = updated ?? (existing ? durableToLog(existing) : null);
      if (base) {
        const merged = { ...base, ...patch, id };
        await upsertDurableAutomationExecution(executionLogToDurableRow(merged));
        // Keep process cache in sync after durable update.
        if (index < 0) {
          bucket.logs = [merged, ...bucket.logs].slice(0, MAX_LOGS);
        } else {
          bucket.logs[index] = merged;
        }
        return merged;
      }
    }
  }

  return updated;
}

export async function listAutomationExecutionLogs(options?: {
  automationId?: string;
  userId?: string;
  limit?: number;
}): Promise<AutomationExecutionLogEntry[]> {
  const limit = options?.limit ?? 100;

  if (isAutomationDurableRequired()) {
    const rows = await listDurableAutomationExecutions({
      automationId: options?.automationId,
      ownerUserId: options?.userId,
      limit,
    });
    return rows.map(durableToLog);
  }

  const bucket = getBucket();
  return bucket.logs
    .filter((row) =>
      options?.automationId ? row.automationId === options.automationId : true,
    )
    .filter((row) => (options?.userId ? row.userId === options.userId : true))
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
