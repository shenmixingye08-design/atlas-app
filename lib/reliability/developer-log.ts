/**
 * Developer diagnostic logs for work failures.
 * Every error must be investigable: StackTrace, API response summary,
 * JobID, WorkflowID, UserID — never an opaque「処理できませんでした」.
 */

import {
  classifyFailure,
  failureClassCause,
  type FailureClass,
} from "./error-classification";

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
  /** P06: root cause for operators (never shown raw to end users). */
  cause: string;
  /** P06: how to reproduce. */
  reproduction: string;
  /** P06: what was / should be fixed. */
  fixContent: string;
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
  /** Override auto-filled P06 fields when known. */
  cause?: string | null;
  reproduction?: string | null;
  fixContent?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

function defaultReproduction(input: RecordDeveloperErrorInput): string {
  const parts = [
    input.step ? `step=${input.step}` : null,
    input.jobId ? `jobId=${input.jobId}` : null,
    input.commanderRunId ? `runId=${input.commanderRunId}` : null,
    input.userId ? `userId=${input.userId}` : null,
    input.attempt != null ? `attempt=${input.attempt}` : null,
  ].filter(Boolean);
  return parts.length > 0
    ? `再現: ${parts.join(" / ")} で同条件を再実行`
    : "再現: 同一依頼・同一形式で再実行";
}

function defaultFixContent(failureClass: FailureClass): string {
  switch (failureClass) {
    case "timeout":
      return "修正: タイムアウト時は withRetry で自動再試行し、途中成果物は保持";
    case "save_failure":
      return "修正: Storage/DB 失敗は fail-closed + 自動再試行。成功済み形式は消さない";
    case "network":
    case "rate_limit":
    case "openai":
      return "修正: API 失敗は指数バックオフ再試行。ユーザーには再試行中メッセージのみ";
    case "generation_failure":
      return "修正: 生成失敗は 1 回再生成。部分成功形式は download 可能のまま残す";
    default:
      return "修正: 分類に応じて自動再試行。例外は developer-log に原因/再現/修正を保存";
  }
}

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
    cause: truncate(
      input.cause?.trim() ||
        `${failureClassCause(failureClass)}: ${message}`,
      1000,
    ),
    reproduction: truncate(
      input.reproduction?.trim() || defaultReproduction(input),
      1000,
    ),
    fixContent: truncate(
      input.fixContent?.trim() || defaultFixContent(failureClass),
      1000,
    ),
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
    cause: entry.cause,
    reproduction: entry.reproduction,
    fixContent: entry.fixContent,
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
