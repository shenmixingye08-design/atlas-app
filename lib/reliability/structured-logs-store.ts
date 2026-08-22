/**
 * P2-04: Durable store for correlation-tagged structured developer logs.
 * Postgres `atlas_structured_logs` is the source of truth.
 * Process memory is never treated as SoT.
 */

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

import {
  isSensitiveLogKey,
  redactSecrets as redactStructuredValue,
} from "@/lib/security/redact";

import { ATLAS_STRUCTURED_LOGS_MIGRATION_SQL } from "./structured-logs-migration-sql";
import type { DeveloperErrorLog } from "./developer-log";

const TABLE = "atlas_structured_logs";

const BINARY_OMIT_KEY =
  /^(content_base64|image(_data|_base64)?|data_url|raw_image)$/i;

/** Supabase/GoTrue clock skew right after cold start / deploy. */
export function isTransientJwtClockError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /JWT issued at future|token used before issued|iat/i.test(message);
}

export type StructuredLogRow = {
  id: string;
  correlation_id: string;
  vercel_request_id: string | null;
  diagnostic_id: string | null;
  at: string;
  user_id: string | null;
  job_id: string | null;
  workflow_id: string | null;
  commander_run_id: string | null;
  step: string | null;
  attempt: number | null;
  max_attempts: number | null;
  failure_class: string | null;
  message: string;
  cause: string | null;
  reproduction: string | null;
  fix_content: string | null;
  stack_trace: string | null;
  api_status: string | null;
  api_response_summary: string | null;
  duration_ms: number | null;
  process_log: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type PersistStructuredLogResult = {
  ok: boolean;
  error: string | null;
  softSuccess: false;
};

function projectRefFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function redactSecrets(value: string | null | undefined): string | null {
  if (value == null) return null;
  const redacted = redactStructuredValue(value);
  return typeof redacted === "string" ? redacted : "[redacted]";
}

export function sanitizeStructuredMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveLogKey(key) || BINARY_OMIT_KEY.test(key)) continue;
    if (typeof value === "string") {
      if (/^data:image\//i.test(value) || value.length > 2000) {
        out[key] = `[omitted:${Math.min(value.length, 999999)}chars]`;
        continue;
      }
      out[key] = redactSecrets(value.slice(0, 500)) ?? value.slice(0, 500);
      continue;
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) =>
        typeof item === "string"
          ? (redactSecrets(item.slice(0, 200)) ?? item.slice(0, 200))
          : redactStructuredValue(item),
      );
      continue;
    }
    if (typeof value === "object") {
      out[key] = sanitizeStructuredMetadata(
        value as Record<string, unknown>,
      );
    }
  }
  return out;
}

export function developerLogToRow(entry: DeveloperErrorLog): StructuredLogRow {
  const apiStatus =
    entry.apiStatus == null ? null : String(entry.apiStatus);
  return {
    id: entry.id,
    correlation_id: entry.correlationId,
    vercel_request_id: entry.vercelRequestId,
    diagnostic_id: entry.diagnosticId,
    at: entry.at,
    user_id: entry.userId,
    job_id: entry.jobId,
    workflow_id: entry.workflowId,
    commander_run_id: entry.commanderRunId,
    step: entry.step,
    attempt: entry.attempt,
    max_attempts: entry.maxAttempts,
    failure_class: entry.failureClass,
    message: redactSecrets(entry.message) ?? entry.message,
    cause: redactSecrets(entry.cause),
    reproduction: redactSecrets(entry.reproduction),
    fix_content: redactSecrets(entry.fixContent),
    stack_trace: redactSecrets(entry.stackTrace),
    api_status: apiStatus,
    api_response_summary: redactSecrets(entry.apiResponseSummary),
    duration_ms: entry.durationMs,
    process_log: redactSecrets(entry.processLog),
    metadata: sanitizeStructuredMetadata(entry.metadata),
  };
}

export function rowToDeveloperLog(row: StructuredLogRow): DeveloperErrorLog {
  const apiRaw = row.api_status;
  let apiStatus: number | string | null = null;
  if (apiRaw != null && apiRaw !== "") {
    const asNum = Number(apiRaw);
    apiStatus = Number.isFinite(asNum) && String(asNum) === apiRaw ? asNum : apiRaw;
  }
  return {
    id: row.id,
    at: row.at,
    correlationId: row.correlation_id,
    vercelRequestId: row.vercel_request_id,
    diagnosticId: row.diagnostic_id,
    userId: row.user_id,
    jobId: row.job_id,
    workflowId: row.workflow_id,
    commanderRunId: row.commander_run_id,
    step: row.step,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    failureClass: (row.failure_class ?? "unknown") as DeveloperErrorLog["failureClass"],
    message: row.message,
    cause: row.cause ?? "",
    reproduction: row.reproduction ?? "",
    fixContent: row.fix_content ?? "",
    stackTrace: row.stack_trace,
    apiStatus,
    apiResponseSummary: row.api_response_summary,
    durationMs: row.duration_ms,
    processLog: row.process_log,
    ...(row.metadata && Object.keys(row.metadata).length > 0
      ? { metadata: row.metadata }
      : {}),
  };
}

export async function applyStructuredLogsMigration(): Promise<{
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
}> {
  const sql = ATLAS_STRUCTURED_LOGS_MIGRATION_SQL;
  const viaPg = await tryApplyViaPostgres(sql);
  if (viaPg.applied) {
    return {
      appliedViaPostgres: true,
      appliedViaManagementApi: false,
      error: null,
    };
  }
  const viaApi = await tryApplyViaManagementApi(sql);
  if (viaApi.applied) {
    return {
      appliedViaPostgres: false,
      appliedViaManagementApi: true,
      error: null,
    };
  }
  return {
    appliedViaPostgres: false,
    appliedViaManagementApi: false,
    error: viaApi.error ?? viaPg.error,
  };
}

async function tryApplyViaPostgres(sql: string): Promise<{
  applied: boolean;
  error: string | null;
}> {
  const connectionString =
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  if (!connectionString || !sql.trim()) {
    return { applied: false, error: null };
  }

  try {
    const pgModule = await import("pg");
    const Client = pgModule.Client ?? pgModule.default?.Client;
    if (!Client) {
      return { applied: false, error: "pg_client_unavailable" };
    }
    const client = new Client({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return { applied: true, error: null };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function tryApplyViaManagementApi(sql: string): Promise<{
  applied: boolean;
  error: string | null;
}> {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
    process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() ||
    "";
  const ref =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(getSupabaseServiceRoleEnv()?.url) ||
    "";
  if (!token || !ref) {
    return { applied: false, error: null };
  }

  try {
    const endpoints = [
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
    ];
    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      const body = endpoint.endsWith("/migrations")
        ? {
            name: "atlas_structured_logs_p2_04",
            query: sql,
          }
        : { query: sql };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return { applied: true, error: null };
      }
      const text = await response.text();
      lastError = `management_api_${response.status}: ${text.slice(0, 300)}`;
    }
    return { applied: false, error: lastError };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Idempotent upsert by primary key `id`. Duplicate execution is safe.
 * Never soft-succeeds: missing client / insert error → ok=false.
 */
export async function persistStructuredLog(
  entry: DeveloperErrorLog,
): Promise<PersistStructuredLogResult> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      error: "supabase_service_role_not_configured",
      softSuccess: false,
    };
  }

  const row = developerLogToRow(entry);
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { error } = await client.from(TABLE).upsert(row as never, {
      onConflict: "id",
    });
    if (!error) {
      return { ok: true, error: null, softSuccess: false };
    }
    lastError = error.message;
    const missing = /schema cache|does not exist|Could not find the table/i.test(
      error.message,
    );
    const jwtSkew = isTransientJwtClockError(error.message);
    if (missing && attempt === 1) {
      await applyStructuredLogsMigration();
    } else if (
      !missing &&
      !jwtSkew &&
      !/duplicate|unique|conflict/i.test(error.message)
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, jwtSkew ? 500 * attempt : 200 * attempt));
  }

  // Treat unique conflict after successful prior write as idempotent OK.
  if (lastError && /duplicate|unique|conflict/i.test(lastError)) {
    const existing = await getStructuredLogById(entry.id);
    if (existing) {
      return { ok: true, error: null, softSuccess: false };
    }
  }

  return {
    ok: false,
    error: lastError ?? "persist_failed",
    softSuccess: false,
  };
}

export async function getStructuredLogById(
  id: string,
): Promise<DeveloperErrorLog | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToDeveloperLog(data as StructuredLogRow);
}

export async function getStructuredLogsByCorrelationId(
  correlationId: string,
  options?: { limit?: number },
): Promise<DeveloperErrorLog[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  const limit = options?.limit ?? 50;
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("correlation_id", correlationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as StructuredLogRow[]).map(rowToDeveloperLog);
}

/**
 * Ownership-scoped list. Cross-user: never returns rows for other users
 * when userId filter is set (service-role still enforces filter in query).
 */
export async function listStructuredLogsDurable(filter: {
  userId?: string;
  jobId?: string;
  correlationId?: string;
  workflowId?: string;
  commanderRunId?: string;
  limit?: number;
}): Promise<DeveloperErrorLog[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  const limit = filter.limit ?? 50;
  let q = client
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  if (filter.correlationId) q = q.eq("correlation_id", filter.correlationId);
  if (filter.workflowId) q = q.eq("workflow_id", filter.workflowId);
  if (filter.commanderRunId) {
    q = q.eq("commander_run_id", filter.commanderRunId);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as StructuredLogRow[]).map(rowToDeveloperLog);
}

export async function deleteStructuredLogsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  await client.from(TABLE).delete().in("id", ids);
}
