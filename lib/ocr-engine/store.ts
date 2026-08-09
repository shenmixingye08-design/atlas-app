/**
 * P2-05: Durable OCR engine evaluation store (Postgres SoT).
 */

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

import { ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL } from "./migration-sql";
import type { OcrEngineEvaluationRecord } from "./types";

const TABLE = "atlas_ocr_engine_evaluations";

export type PersistOcrEvaluationResult = {
  ok: boolean;
  error: string | null;
  softSuccess: false;
};

export function isTransientJwtClockError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  return /JWT issued at future|token used before issued|iat/i.test(message);
}

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

export async function applyOcrEngineEvaluationsMigration(): Promise<{
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
}> {
  const sql = ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL;
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
    if (!Client) return { applied: false, error: "pg_client_unavailable" };
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
  if (!token || !ref) return { applied: false, error: null };
  try {
    const endpoints = [
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
    ];
    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      const body = endpoint.endsWith("/migrations")
        ? { name: "atlas_ocr_engine_evaluations_p2_05", query: sql }
        : { query: sql };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return { applied: true, error: null };
      lastError = `management_api_${response.status}: ${(await response.text()).slice(0, 300)}`;
    }
    return { applied: false, error: lastError };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toRow(record: OcrEngineEvaluationRecord) {
  return {
    id: record.id,
    correlation_id: record.correlationId,
    at: record.at,
    user_id: record.userId,
    engine_id: record.engineId,
    dedicated_engine_required: record.dedicatedEngineRequired,
    accuracy: record.accuracy,
    tokens_expected: record.tokensExpected,
    tokens_hit: record.tokensHit,
    extracted_text_preview: record.extractedTextPreview,
    confidence: record.confidence,
    metadata: record.metadata,
  };
}

function fromRow(row: Record<string, unknown>): OcrEngineEvaluationRecord {
  return {
    id: String(row.id),
    correlationId: String(row.correlation_id),
    at: String(row.at),
    userId: String(row.user_id),
    engineId: row.engine_id as OcrEngineEvaluationRecord["engineId"],
    dedicatedEngineRequired: Boolean(row.dedicated_engine_required),
    accuracy: Number(row.accuracy ?? 0),
    tokensExpected: Array.isArray(row.tokens_expected)
      ? (row.tokens_expected as string[])
      : [],
    tokensHit: Array.isArray(row.tokens_hit) ? (row.tokens_hit as string[]) : [],
    extractedTextPreview: String(row.extracted_text_preview ?? ""),
    confidence: Number(row.confidence ?? 0),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export async function persistOcrEngineEvaluation(
  record: OcrEngineEvaluationRecord,
): Promise<PersistOcrEvaluationResult> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      error: "supabase_service_role_not_configured",
      softSuccess: false,
    };
  }

  const row = toRow(record);
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { error } = await client.from(TABLE).upsert(row as never, {
      onConflict: "id",
    });
    if (!error) return { ok: true, error: null, softSuccess: false };
    lastError = error.message;
    const missing = /schema cache|does not exist|Could not find the table/i.test(
      error.message,
    );
    const jwtSkew = isTransientJwtClockError(error.message);
    if (missing && attempt === 1) {
      await applyOcrEngineEvaluationsMigration();
    } else if (
      !missing &&
      !jwtSkew &&
      !/duplicate|unique|conflict/i.test(error.message)
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, jwtSkew ? 500 * attempt : 200 * attempt));
  }

  if (lastError && /duplicate|unique|conflict/i.test(lastError)) {
    const existing = await getOcrEngineEvaluationById(record.id);
    if (existing) return { ok: true, error: null, softSuccess: false };
  }

  return {
    ok: false,
    error: lastError ?? "persist_failed",
    softSuccess: false,
  };
}

export async function getOcrEngineEvaluationById(
  id: string,
): Promise<OcrEngineEvaluationRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function getOcrEngineEvaluationsByCorrelationId(
  correlationId: string,
  options?: { limit?: number },
): Promise<OcrEngineEvaluationRecord[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("correlation_id", correlationId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 20);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(fromRow);
}

export async function listOcrEngineEvaluationsByUser(input: {
  userId: string;
  correlationId?: string;
  limit?: number;
}): Promise<OcrEngineEvaluationRecord[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  let q = client
    .from(TABLE)
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (input.correlationId) q = q.eq("correlation_id", input.correlationId);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(fromRow);
}

export async function getLatestOcrEnginePolicy(): Promise<{
  dedicatedEngineRequired: boolean;
  engineId: OcrEngineEvaluationRecord["engineId"] | null;
  accuracy: number | null;
} | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLE)
    .select("engine_id, dedicated_engine_required, accuracy")
    .eq("user_id", "__atlas_ocr_engine_probe__")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    engine_id: string;
    dedicated_engine_required: boolean;
    accuracy: number | string | null;
  };
  return {
    dedicatedEngineRequired: Boolean(row.dedicated_engine_required),
    engineId: row.engine_id as OcrEngineEvaluationRecord["engineId"],
    accuracy:
      typeof row.accuracy === "number" ? row.accuracy : Number(row.accuracy),
  };
}

export async function deleteOcrEngineEvaluationsByIds(
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  await client.from(TABLE).delete().in("id", ids);
}
