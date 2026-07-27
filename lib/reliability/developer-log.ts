/**
 * Developer diagnostic logs for work failures.
 * Every error must be investigable: StackTrace, API response summary,
 * JobID, WorkflowID, UserID — never an opaque「処理できませんでした」.
 */

import { classifyFailure, type FailureClass } from "./error-classification";

export type DeveloperErrorLog = {
  id: string;
  at: string;
  userId: string | null;
  jobId: string | null;
  workflowId: string | null;
  commanderRunId: string | null;
  step: string | null;
  attempt: number | null;
  maxAttempts: number | null;
  failureClass: FailureClass;
  message: string;
  stackTrace: string | null;
  apiStatus: number | string | null;
  apiResponseSummary: string | null;
  durationMs: number | null;
  processLog: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

const MAX_DEV_LOGS = 2000;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotDeveloperErrorLogs?: DeveloperErrorLog[];
  };
}

function getLogs(): DeveloperErrorLog[] {
  const scope = getGlobalScope();
  if (!scope.__minervotDeveloperErrorLogs) {
    scope.__minervotDeveloperErrorLogs = [];
  }
  return scope.__minervotDeveloperErrorLogs;
}

function truncate(value: string, max = 4000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function extractStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) {
    return truncate(error.stack, 8000);
  }
  return null;
}

function extractApiSummary(error: unknown): {
  status: number | string | null;
  summary: string | null;
} {
  if (!error || typeof error !== "object") {
    return { status: null, summary: null };
  }
  const err = error as Record<string, unknown>;
  const status =
    (typeof err.status === "number" || typeof err.status === "string"
      ? err.status
      : null) ??
    (typeof err.statusCode === "number" || typeof err.statusCode === "string"
      ? err.statusCode
      : null) ??
    null;

  const response = err.response ?? err.body ?? err.data ?? null;
  let summary: string | null = null;
  if (typeof response === "string") {
    summary = truncate(response);
  } else if (response != null) {
    try {
      summary = truncate(JSON.stringify(response));
    } catch {
      summary = truncate(String(response));
    }
  } else if (typeof err.message === "string") {
    summary = truncate(err.message);
  }

  return { status, summary };
}

export type RecordDeveloperErrorInput = {
  userId?: string | null;
  jobId?: string | null;
  workflowId?: string | null;
  commanderRunId?: string | null;
  step?: string | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  error: unknown;
  failureClass?: FailureClass;
  durationMs?: number | null;
  processLog?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

/** Persist a developer-facing error log (in-memory + console for Vercel logs). */
export function recordDeveloperError(
  input: RecordDeveloperErrorInput,
): DeveloperErrorLog {
  const failureClass = input.failureClass ?? classifyFailure(input.error);
  const message =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
        ? input.error
        : String(input.error ?? "unknown error");
  const api = extractApiSummary(input.error);

  const entry: DeveloperErrorLog = {
    id: `dlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    workflowId: input.workflowId ?? null,
    commanderRunId: input.commanderRunId ?? null,
    step: input.step ?? null,
    attempt: input.attempt ?? null,
    maxAttempts: input.maxAttempts ?? null,
    failureClass,
    message: truncate(message, 1000),
    stackTrace: extractStack(input.error),
    apiStatus: api.status,
    apiResponseSummary: api.summary,
    durationMs: input.durationMs ?? null,
    processLog: input.processLog ? truncate(input.processLog, 4000) : null,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const logs = getLogs();
  logs.unshift(entry);
  if (logs.length > MAX_DEV_LOGS) {
    logs.length = MAX_DEV_LOGS;
  }

  // Always emit structured console output so production logs are investigable.
  console.error("[minervot-developer-error]", {
    id: entry.id,
    failureClass: entry.failureClass,
    message: entry.message,
    userId: entry.userId,
    jobId: entry.jobId,
    workflowId: entry.workflowId,
    commanderRunId: entry.commanderRunId,
    step: entry.step,
    attempt: entry.attempt,
    maxAttempts: entry.maxAttempts,
    durationMs: entry.durationMs,
    apiStatus: entry.apiStatus,
    apiResponseSummary: entry.apiResponseSummary,
    stackTrace: entry.stackTrace,
    processLog: entry.processLog,
    metadata: entry.metadata ?? null,
  });

  return entry;
}

export function listDeveloperErrorLogs(filter: {
  userId?: string;
  jobId?: string;
  workflowId?: string;
  commanderRunId?: string;
  limit?: number;
}): DeveloperErrorLog[] {
  const limit = filter.limit ?? 50;
  return getLogs()
    .filter((entry) => {
      if (filter.userId && entry.userId !== filter.userId) return false;
      if (filter.jobId && entry.jobId !== filter.jobId) return false;
      if (filter.workflowId && entry.workflowId !== filter.workflowId) {
        return false;
      }
      if (
        filter.commanderRunId &&
        entry.commanderRunId !== filter.commanderRunId
      ) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}

export function resetDeveloperErrorLogsForTests(): void {
  getGlobalScope().__minervotDeveloperErrorLogs = [];
}
