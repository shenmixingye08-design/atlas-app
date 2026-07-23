import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type {
  AutomationExecutionLogEntry,
  AutomationExecutionLogSnapshot,
} from "./types";

const MAX_ENTRIES = 500;
const EXECUTION_LOG_USER_ID = "__atlas_automation_execution_logs__";
export const AUTOMATION_EXECUTION_LOG_DOMAIN = "atlasAutomationExecutionLogs";

type LogBucket = {
  entries: AutomationExecutionLogEntry[];
  hydrated: boolean;
};

function getBucket(): LogBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationExecutionLogs?: LogBucket;
  };
  if (!globalScope.__atlasAutomationExecutionLogs) {
    globalScope.__atlasAutomationExecutionLogs = {
      entries: [],
      hydrated: false,
    };
  }
  return globalScope.__atlasAutomationExecutionLogs;
}

async function ensureHydrated(): Promise<void> {
  const bucket = getBucket();
  if (bucket.hydrated) return;
  bucket.hydrated = true;
  try {
    const loaded = await loadDurableDomain<{
      entries: AutomationExecutionLogEntry[];
    }>(EXECUTION_LOG_USER_ID, AUTOMATION_EXECUTION_LOG_DOMAIN);
    if (loaded?.entries && Array.isArray(loaded.entries)) {
      bucket.entries = loaded.entries.slice(0, MAX_ENTRIES);
    }
  } catch (error) {
    console.error("[automation-execution-log] hydrate failed", error);
  }
}

function schedulePersist(): void {
  const bucket = getBucket();
  void persistDurableDomain(
    EXECUTION_LOG_USER_ID,
    AUTOMATION_EXECUTION_LOG_DOMAIN,
    { entries: bucket.entries.slice(0, MAX_ENTRIES) },
    {
      forceSupabase: true,
      compact: (state) => ({
        entries: state.entries.slice(0, 200).map((entry) => ({
          ...entry,
          generatedContent: entry.generatedContent?.slice(0, 400) ?? null,
          error: entry.error?.slice(0, 300) ?? null,
          actions: entry.actions.slice(0, 12),
        })),
      }),
    },
  );
}

export async function recordAutomationExecutionLog(
  entry: Omit<AutomationExecutionLogEntry, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<AutomationExecutionLogEntry> {
  await ensureHydrated();
  const now = new Date().toISOString();
  const record: AutomationExecutionLogEntry = {
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? now,
    userId: entry.userId,
    automationId: entry.automationId,
    automationName: entry.automationName,
    workflowRunId: entry.workflowRunId,
    triggerType: entry.triggerType,
    event: entry.event,
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
    tweetUrl: entry.tweetUrl?.slice(0, 300) ?? null,
    tweetId: entry.tweetId?.slice(0, 64) ?? null,
    generatedContent: entry.generatedContent?.slice(0, 800) ?? null,
    aiRan: entry.aiRan,
    xApiCalled: entry.xApiCalled,
    stoppedAtStage: entry.stoppedAtStage,
    nextRetryAt: entry.nextRetryAt,
  };

  const bucket = getBucket();
  bucket.entries = [record, ...bucket.entries].slice(0, MAX_ENTRIES);
  schedulePersist();
  return record;
}

export async function listAutomationExecutionLogs(
  limit = 100,
): Promise<AutomationExecutionLogEntry[]> {
  await ensureHydrated();
  return getBucket().entries.slice(0, Math.max(1, Math.min(limit, MAX_ENTRIES)));
}

export async function getAutomationExecutionLogSnapshot(
  limit = 100,
): Promise<AutomationExecutionLogSnapshot> {
  await ensureHydrated();
  const entries = await listAutomationExecutionLogs(limit);
  const all = getBucket().entries.filter(
    (e) => e.event === "completed" || e.event === "failed",
  );
  const completed = all.filter((e) => e.status === "completed").length;
  const failed = all.filter((e) => e.status === "failed").length;
  const finished = completed + failed;
  const withDuration = all.filter(
    (e) => typeof e.durationMs === "number" && e.durationMs >= 0,
  );
  const durationSum = withDuration.reduce(
    (sum, e) => sum + (e.durationMs ?? 0),
    0,
  );

  return {
    entries,
    totals: {
      runs: all.length,
      completed,
      failed,
      successRate: finished === 0 ? 0 : completed / finished,
      averageDurationMs:
        withDuration.length === 0
          ? 0
          : Math.round(durationSum / withDuration.length),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function resetAutomationExecutionLogsForTests(): void {
  const bucket = getBucket();
  bucket.entries = [];
  bucket.hydrated = true;
}
