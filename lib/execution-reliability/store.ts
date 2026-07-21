import {
  EXECUTION_LOG_LIMIT,
  EXECUTION_STATE_RETENTION,
  EXECUTION_STORAGE_KEY,
} from "./constants";
import type {
  ExecutionLogEntry,
  ExecutionPhase,
  ExecutionStateRecord,
} from "./types";

type StoreShape = {
  records: ExecutionStateRecord[];
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): StoreShape {
  if (!canUseStorage()) return { records: [] };
  try {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (!raw) return { records: [] };
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.records)) return { records: [] };
    return { records: parsed.records };
  } catch {
    return { records: [] };
  }
}

function writeStore(store: StoreShape): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify({
        records: store.records.slice(0, EXECUTION_STATE_RETENTION),
      }),
    );
  } catch {
    // Storage full / private mode — ignore; UI still works without persistence.
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createExecutionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function startExecutionState(input: {
  id?: string;
  userKey?: string;
  assignment: string;
  maxAttempts: number;
  timeoutMs: number;
}): ExecutionStateRecord {
  const startedAt = nowIso();
  const record: ExecutionStateRecord = {
    id: input.id ?? createExecutionId(),
    userKey: input.userKey ?? "local",
    assignmentPreview: input.assignment.trim().slice(0, 160),
    phase: "running",
    startedAt,
    updatedAt: startedAt,
    attempt: 1,
    maxAttempts: input.maxAttempts,
    timeoutMs: input.timeoutMs,
    timedOut: false,
    failureReason: null,
    projectId: null,
    notificationGuaranteed: false,
    logs: [
      {
        at: startedAt,
        level: "info",
        message: "実行を開始しました",
      },
    ],
  };

  const store = readStore();
  store.records = [record, ...store.records.filter((item) => item.id !== record.id)];
  writeStore(store);
  return record;
}

export function appendExecutionLog(
  id: string,
  entry: Omit<ExecutionLogEntry, "at"> & { at?: string },
): ExecutionStateRecord | null {
  const store = readStore();
  const index = store.records.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const next: ExecutionStateRecord = {
    ...store.records[index],
    updatedAt: nowIso(),
    logs: [
      ...store.records[index].logs,
      {
        at: entry.at ?? nowIso(),
        level: entry.level,
        message: entry.message,
        detail: entry.detail ?? null,
      },
    ].slice(-EXECUTION_LOG_LIMIT),
  };
  store.records[index] = next;
  writeStore(store);
  return next;
}

export function updateExecutionState(
  id: string,
  patch: Partial<
    Pick<
      ExecutionStateRecord,
      | "phase"
      | "attempt"
      | "timedOut"
      | "failureReason"
      | "projectId"
      | "notificationGuaranteed"
    >
  >,
): ExecutionStateRecord | null {
  const store = readStore();
  const index = store.records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next: ExecutionStateRecord = {
    ...store.records[index],
    ...patch,
    updatedAt: nowIso(),
  };
  store.records[index] = next;
  writeStore(store);
  return next;
}

export function markExecutionPhase(
  id: string,
  phase: ExecutionPhase,
  message?: string,
): ExecutionStateRecord | null {
  const updated = updateExecutionState(id, { phase });
  if (!updated) return null;
  if (message) {
    return appendExecutionLog(id, {
      level: phase === "failed" || phase === "timed_out" ? "error" : "info",
      message,
    });
  }
  return updated;
}

export function getExecutionState(id: string): ExecutionStateRecord | null {
  return readStore().records.find((item) => item.id === id) ?? null;
}

export function listRecentExecutions(limit = 10): ExecutionStateRecord[] {
  return readStore().records.slice(0, limit);
}

export function getActiveExecution(): ExecutionStateRecord | null {
  return (
    readStore().records.find(
      (item) =>
        item.phase === "queued" ||
        item.phase === "running" ||
        item.phase === "retrying",
    ) ?? null
  );
}
