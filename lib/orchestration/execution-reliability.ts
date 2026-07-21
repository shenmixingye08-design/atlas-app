/**
 * Execution reliability helpers for MINERVOT work runs.
 *
 * Goals (user-facing AI secretary reliability):
 * - Persist execution state across attempts
 * - Auto-retry mid-run failures
 * - Timeout monitoring metadata
 * - Durable execution logs
 * - Completion / failure notification guarantee
 * - Clear failure reasons for the UI
 * - 6-stage progress metadata for the trust UX
 */

import type { WorkProgressStageId } from "@/lib/work-progress/stages";

export type ExecutionLogLevel = "info" | "warn" | "error";

export type ExecutionLogEntry = {
  id: string;
  runId: string;
  userId: string;
  at: string;
  level: ExecutionLogLevel;
  event: string;
  message: string;
  attempt?: number;
  timedOut?: boolean;
  stage?: WorkProgressStageId;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PersistedExecutionState = {
  runId: string;
  userId: string;
  status:
    | "queued"
    | "running"
    | "retrying"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled";
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  timedOut: boolean;
  updatedAt: string;
  startedAt: string;
  /** User-facing 6-stage progress. */
  stage: WorkProgressStageId;
  stoppedAtStage: WorkProgressStageId | null;
};

const MAX_LOGS = 2000;
const MAX_STATES = 500;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotExecutionLogs?: ExecutionLogEntry[];
    __minervotExecutionStates?: Map<string, PersistedExecutionState>;
  };
}

function getLogs(): ExecutionLogEntry[] {
  const scope = getGlobalScope();
  if (!scope.__minervotExecutionLogs) {
    scope.__minervotExecutionLogs = [];
  }
  return scope.__minervotExecutionLogs;
}

function getStates(): Map<string, PersistedExecutionState> {
  const scope = getGlobalScope();
  if (!scope.__minervotExecutionStates) {
    scope.__minervotExecutionStates = new Map();
  }
  return scope.__minervotExecutionStates;
}

function stateKey(runId: string, userId: string): string {
  return `${userId}::${runId}`;
}

export function appendExecutionLog(
  input: Omit<ExecutionLogEntry, "id" | "at"> & { at?: string },
): ExecutionLogEntry {
  const entry: ExecutionLogEntry = {
    id: `elog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: input.at ?? new Date().toISOString(),
    runId: input.runId,
    userId: input.userId,
    level: input.level,
    event: input.event,
    message: input.message,
    ...(input.attempt != null ? { attempt: input.attempt } : {}),
    ...(input.timedOut != null ? { timedOut: input.timedOut } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const logs = getLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  return entry;
}

export function listExecutionLogs(filter: {
  runId?: string;
  userId?: string;
  limit?: number;
}): ExecutionLogEntry[] {
  const limit = filter.limit ?? 50;
  return getLogs()
    .filter((entry) => {
      if (filter.runId && entry.runId !== filter.runId) return false;
      if (filter.userId && entry.userId !== filter.userId) return false;
      return true;
    })
    .slice(0, limit);
}

export function persistExecutionState(
  input: Omit<PersistedExecutionState, "updatedAt" | "startedAt" | "stage" | "stoppedAtStage"> & {
    startedAt?: string;
    stage?: WorkProgressStageId;
    stoppedAtStage?: WorkProgressStageId | null;
  },
): PersistedExecutionState {
  const key = stateKey(input.runId, input.userId);
  const existing = getStates().get(key);
  const stage =
    input.stage ??
    existing?.stage ??
    (input.status === "completed"
      ? "delivered"
      : input.status === "queued"
        ? "accepted"
        : "executing");
  const next: PersistedExecutionState = {
    runId: input.runId,
    userId: input.userId,
    status: input.status,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    lastError: input.lastError,
    timedOut: input.timedOut,
    startedAt: input.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage,
    stoppedAtStage:
      input.stoppedAtStage !== undefined
        ? input.stoppedAtStage
        : input.status === "failed"
          ? stage
          : (existing?.stoppedAtStage ?? null),
  };
  getStates().set(key, next);

  const states = getStates();
  if (states.size > MAX_STATES) {
    const oldestKey = states.keys().next().value;
    if (oldestKey) states.delete(oldestKey);
  }

  appendExecutionLog({
    runId: input.runId,
    userId: input.userId,
    level: input.status === "failed" ? "error" : "info",
    event: "state_persisted",
    message: `実行状態を保存しました: ${input.status}`,
    attempt: input.attempt,
    timedOut: input.timedOut,
    stage,
    metadata: {
      maxAttempts: input.maxAttempts,
      lastError: input.lastError,
      stage,
      stoppedAtStage: next.stoppedAtStage,
    },
  });

  return next;
}

/** Advance the user-facing stage and append a readable log line. */
export function advanceExecutionStage(input: {
  runId: string;
  userId: string;
  stage: WorkProgressStageId;
  message: string;
  attempt?: number;
  status?: PersistedExecutionState["status"];
}): PersistedExecutionState {
  const existing = getExecutionState(input.runId, input.userId);
  const state = persistExecutionState({
    runId: input.runId,
    userId: input.userId,
    status: input.status ?? existing?.status ?? "running",
    attempt: input.attempt ?? existing?.attempt ?? 1,
    maxAttempts: existing?.maxAttempts ?? 3,
    lastError: existing?.lastError ?? null,
    timedOut: existing?.timedOut ?? false,
    stage: input.stage,
    stoppedAtStage: null,
  });
  appendExecutionLog({
    runId: input.runId,
    userId: input.userId,
    level: "info",
    event: "stage_advanced",
    message: input.message,
    attempt: state.attempt,
    stage: input.stage,
  });
  return state;
}

export function listExecutionStatesForUser(userId: string): PersistedExecutionState[] {
  return [...getStates().values()]
    .filter((state) => state.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export function getExecutionState(
  runId: string,
  userId: string,
): PersistedExecutionState | null {
  return getStates().get(stateKey(runId, userId)) ?? null;
}

/** True when a failure should be retried (timeouts / transient infra). */
export function isRetryableFailure(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);

  if (/cancel/i.test(message)) return false;
  if (/unauthorized|forbidden|認証|権限/i.test(message)) return false;

  return (
    /timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|429|503|502|一時|タイムアウト|ネットワーク/i.test(
      message,
    ) || /failed|error|失敗|エラー/i.test(message)
  );
}

export function formatFailureReason(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "実行に失敗しました。";

  const cleaned = raw
    .replace(/sk-[a-zA-Z0-9]+/g, "")
    .replace(/OPENAI_[A-Z_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "実行に失敗しました。内容をご確認ください。";
  if (/timeout|timed?\s*out|タイムアウト/i.test(cleaned)) {
    return "処理が時間内に終わりませんでした。自動で再試行しています。";
  }
  return cleaned.slice(0, 240);
}

/**
 * Guarantee that a completion/failure notification is recorded.
 * Retries a few times; on total failure, writes an execution log so the
 * incident is still visible to diagnostics.
 */
export function ensureNotificationDelivery<T>(
  create: () => T | null,
  context: {
    runId: string;
    userId: string;
    kind: "completed" | "failed" | "partial" | "cancelled";
    maxAttempts?: number;
  },
): T | null {
  const maxAttempts = context.maxAttempts ?? 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const record = create();
      if (record) {
        appendExecutionLog({
          runId: context.runId,
          userId: context.userId,
          level: "info",
          event: "notification_delivered",
          message: `完了通知を保証しました（${context.kind}）`,
          attempt,
        });
        return record;
      }
      lastError = new Error("createNotification returned null");
    } catch (error) {
      lastError = error;
    }

    appendExecutionLog({
      runId: context.runId,
      userId: context.userId,
      level: "warn",
      event: "notification_retry",
      message: `通知の保存に失敗したため再試行します（${attempt}/${maxAttempts}）`,
      attempt,
      metadata: {
        kind: context.kind,
        error: formatFailureReason(lastError),
      },
    });
  }

  appendExecutionLog({
    runId: context.runId,
    userId: context.userId,
    level: "error",
    event: "notification_failed",
    message: "完了通知の保証に失敗しました",
    metadata: {
      kind: context.kind,
      error: formatFailureReason(lastError),
    },
  });
  return null;
}

/** Monitor wall-clock duration against a budget; returns timedOut flag. */
export function monitorTimeout(input: {
  startedAtMs: number;
  budgetMs: number;
  nowMs?: number;
}): { elapsedMs: number; timedOut: boolean; remainingMs: number } {
  const nowMs = input.nowMs ?? Date.now();
  const elapsedMs = Math.max(0, nowMs - input.startedAtMs);
  const remainingMs = Math.max(0, input.budgetMs - elapsedMs);
  return {
    elapsedMs,
    remainingMs,
    timedOut: elapsedMs >= input.budgetMs,
  };
}
