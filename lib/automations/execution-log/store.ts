import "server-only";

import type {
  AutomationExecutionLogEntry,
  AutomationExecutionLogSnapshot,
} from "./types";

const MAX_ENTRIES = 500;

type LogBucket = {
  entries: AutomationExecutionLogEntry[];
};

function getBucket(): LogBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationExecutionLogs?: LogBucket;
  };
  if (!globalScope.__atlasAutomationExecutionLogs) {
    globalScope.__atlasAutomationExecutionLogs = { entries: [] };
  }
  return globalScope.__atlasAutomationExecutionLogs;
}

export function recordAutomationExecutionLog(
  entry: Omit<AutomationExecutionLogEntry, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): AutomationExecutionLogEntry {
  const now = new Date().toISOString();
  const record: AutomationExecutionLogEntry = {
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? now,
    userId: entry.userId,
    automationId: entry.automationId,
    automationName: entry.automationName,
    workflowRunId: entry.workflowRunId,
    triggerType: entry.triggerType,
    status: entry.status,
    attempt: entry.attempt,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    durationMs: entry.durationMs,
    actions: entry.actions.slice(0, 20),
    apisUsed: [...new Set(entry.apisUsed)].slice(0, 20),
    templateId: entry.templateId,
    error: entry.error?.slice(0, 400) ?? null,
    artifactUrls: entry.artifactUrls.slice(0, 10),
  };

  const bucket = getBucket();
  bucket.entries = [record, ...bucket.entries].slice(0, MAX_ENTRIES);
  return record;
}

export function listAutomationExecutionLogs(limit = 100): AutomationExecutionLogEntry[] {
  return getBucket().entries.slice(0, Math.max(1, Math.min(limit, MAX_ENTRIES)));
}

export function getAutomationExecutionLogSnapshot(
  limit = 100,
): AutomationExecutionLogSnapshot {
  const entries = listAutomationExecutionLogs(limit);
  const all = getBucket().entries;
  const completed = all.filter((e) => e.status === "completed").length;
  const failed = all.filter((e) => e.status === "failed").length;
  const finished = completed + failed;
  const durationSum = all.reduce((sum, e) => sum + Math.max(0, e.durationMs), 0);

  return {
    entries,
    totals: {
      runs: all.length,
      completed,
      failed,
      successRate: finished === 0 ? 0 : completed / finished,
      averageDurationMs: all.length === 0 ? 0 : Math.round(durationSum / all.length),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function resetAutomationExecutionLogsForTests(): void {
  getBucket().entries = [];
}
