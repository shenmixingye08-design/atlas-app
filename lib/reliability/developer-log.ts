/**
 * Developer diagnostic logs for work failures.
 * Every error must be investigable: StackTrace, API response summary,
 * JobID, WorkflowID, UserID, correlationId — never an opaque「処理できませんでした」.
 *
 * P2-04: Postgres `atlas_structured_logs` is the source of truth.
 * Process memory is a local cache only (not SoT across restart / multi-instance).
 */

import { redactSecrets } from "@/lib/security/redact";

import {
  classifyFailure,
  failureClassCause,
  type FailureClass,
} from "./error-classification";

export type DeveloperErrorLog = {
  id: string;
  at: string;
  /** Stable cross-instance correlation key (required P2-04). */
  correlationId: string;
  vercelRequestId: string | null;
  diagnosticId: string | null;
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

type PendingDurable = {
  entryId: string;
  promise: Promise<{ ok: boolean; error: string | null }>;
};

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotDeveloperErrorLogs?: DeveloperErrorLog[];
    __minervotDeveloperErrorDurablePending?: PendingDurable[];
  };
}

function getLogs(): DeveloperErrorLog[] {
  const scope = getGlobalScope();
  if (!scope.__minervotDeveloperErrorLogs) {
    scope.__minervotDeveloperErrorLogs = [];
  }
  return scope.__minervotDeveloperErrorLogs;
}

function getPending(): PendingDurable[] {
  const scope = getGlobalScope();
  if (!scope.__minervotDeveloperErrorDurablePending) {
    scope.__minervotDeveloperErrorDurablePending = [];
  }
  return scope.__minervotDeveloperErrorDurablePending;
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
  /** Explicit correlation id (preferred). */
  correlationId?: string | null;
  vercelRequestId?: string | null;
  diagnosticId?: string | null;
  /**
   * When true, await durable Postgres persist before returning.
   * Default false so hot paths are not blocked; Production probe awaits.
   */
  awaitDurable?: boolean;
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

function resolveCorrelationId(input: RecordDeveloperErrorInput): string {
  const explicit = input.correlationId?.trim();
  if (explicit) return explicit.slice(0, 200);
  if (input.diagnosticId?.trim()) {
    return `corr_diag_${input.diagnosticId.trim()}`.slice(0, 200);
  }
  if (input.jobId?.trim()) {
    const attempt = input.attempt != null ? `_a${input.attempt}` : "";
    return `corr_job_${input.jobId.trim()}${attempt}`.slice(0, 200);
  }
  if (input.commanderRunId?.trim()) {
    return `corr_run_${input.commanderRunId.trim()}`.slice(0, 200);
  }
  if (input.vercelRequestId?.trim()) {
    return `corr_vercel_${input.vercelRequestId.trim()}`.slice(0, 200);
  }
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function enqueueDurablePersist(entry: DeveloperErrorLog): PendingDurable {
  const promise = (async () => {
    try {
      const { persistStructuredLog } = await import("./structured-logs-store");
      const result = await persistStructuredLog(entry);
      if (!result.ok) {
        console.warn("[atlas_structured_logs] durable persist failed", {
          id: entry.id,
          correlationId: entry.correlationId,
          error: result.error,
        });
      }
      return { ok: result.ok, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[atlas_structured_logs] durable persist error", {
        id: entry.id,
        correlationId: entry.correlationId,
        error: message,
      });
      return { ok: false, error: message };
    }
  })();
  const pending: PendingDurable = { entryId: entry.id, promise };
  const queue = getPending();
  queue.push(pending);
  if (queue.length > 200) queue.splice(0, queue.length - 200);
  return pending;
}

/**
 * Persist a developer-facing error log.
 * Always: structured console + local memory cache.
 * Always (best-effort): durable Postgres append with correlationId (P2-04).
 * Memory is NOT SoT — Production investigation must use DB / correlationId.
 */
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
  const correlationId = resolveCorrelationId(input);
  const diagnosticId =
    input.diagnosticId?.trim() ||
    (input.jobId ? `diag_${input.jobId}` : null);

  const entry: DeveloperErrorLog = {
    id: `dlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    correlationId,
    vercelRequestId: input.vercelRequestId?.trim() || null,
    diagnosticId,
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
  // Redact before console — persist path already sanitizes separately.
  console.error(
    "[minervot-developer-error]",
    redactSecrets({
      id: entry.id,
      correlationId: entry.correlationId,
      vercelRequestId: entry.vercelRequestId,
      diagnosticId: entry.diagnosticId,
      failureClass: entry.failureClass,
      message: entry.message,
      cause: entry.cause,
      reproduction: entry.reproduction,
      fixContent: entry.fixContent,
      userId: entry.userId ? "present" : null,
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
    }),
  );

  const pending = enqueueDurablePersist(entry);
  if (input.awaitDurable) {
    // Sync API cannot truly await; callers needing await should use
    // recordDeveloperErrorDurable. Still schedule immediately.
    void pending.promise;
  }

  return entry;
}

/**
 * Record + await durable Postgres persist. Fail-closed on DB errors
 * (returns entry with durableOk=false; does not throw to preserve call sites).
 */
export async function recordDeveloperErrorDurable(
  input: Omit<RecordDeveloperErrorInput, "awaitDurable">,
): Promise<{ entry: DeveloperErrorLog; durableOk: boolean; error: string | null }> {
  const entry = recordDeveloperError({ ...input, awaitDurable: false });
  const durable = await awaitDeveloperErrorPersist(entry.id);
  return {
    entry,
    durableOk: durable.ok,
    error: durable.error,
  };
}

/** Wait for durable persist of a recorded entry (tests / probes). */
export async function awaitDeveloperErrorPersist(
  entryId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const pending = getPending().find((p) => p.entryId === entryId);
  if (!pending) {
    return { ok: false, error: "no_pending_durable_persist" };
  }
  return pending.promise;
}

export async function awaitAllDeveloperErrorPersists(): Promise<void> {
  const pending = [...getPending()];
  await Promise.all(pending.map((p) => p.promise));
}

/**
 * Memory-only list (cache). Prefer listDeveloperErrorLogsDurable in Production.
 */
export function listDeveloperErrorLogs(filter: {
  userId?: string;
  jobId?: string;
  workflowId?: string;
  commanderRunId?: string;
  correlationId?: string;
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
      if (
        filter.correlationId &&
        entry.correlationId !== filter.correlationId
      ) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}

/** Durable SoT list (Postgres). */
export async function listDeveloperErrorLogsDurable(filter: {
  userId?: string;
  jobId?: string;
  workflowId?: string;
  commanderRunId?: string;
  correlationId?: string;
  limit?: number;
}): Promise<DeveloperErrorLog[]> {
  const { listStructuredLogsDurable } = await import("./structured-logs-store");
  return listStructuredLogsDurable(filter);
}

export function resetDeveloperErrorLogsForTests(): void {
  getGlobalScope().__minervotDeveloperErrorLogs = [];
  getGlobalScope().__minervotDeveloperErrorDurablePending = [];
}
