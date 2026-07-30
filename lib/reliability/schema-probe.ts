import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { ATLAS_RELIABILITY_EVENTS_MIGRATION_SQL } from "./migration-sql";

export type ReliabilitySchemaProbe = {
  ok: boolean;
  tableExists: boolean;
  insertOk: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  migrationFiles: string[];
  sqlPreview: string | null;
  probeJobId: string | null;
  envPresence: {
    serviceRole: boolean;
    postgresUrl: boolean;
    supabaseAccessToken: boolean;
    projectRef: string | null;
  };
  version: ReturnType<typeof getHealthVersionPayload>;
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

function envPresence() {
  const service = getSupabaseServiceRoleEnv();
  const postgresUrl = Boolean(
    process.env.POSTGRES_URL?.trim() ||
      process.env.POSTGRES_URL_NON_POOLING?.trim() ||
      process.env.SUPABASE_DB_URL?.trim() ||
      process.env.DATABASE_URL?.trim(),
  );
  const accessToken = Boolean(
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
      process.env.SUPABASE_MANAGEMENT_TOKEN?.trim(),
  );
  return {
    serviceRole: Boolean(service),
    postgresUrl,
    supabaseAccessToken: accessToken,
    projectRef: projectRefFromUrl(service?.url),
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
            name: "atlas_reliability_events_diagnostics",
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

async function applyMigrationSql(sql: string): Promise<{
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
}> {
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

/**
 * Ensure atlas_reliability_events exists (apply when Postgres URL or
 * Supabase Management token is present), then probe a service-role INSERT.
 */
export async function probeReliabilityEventsSchema(input?: {
  apply?: boolean;
}): Promise<ReliabilitySchemaProbe> {
  const version = getHealthVersionPayload();
  const files = [
    "20260726_atlas_reliability_events.sql",
    "20260730_atlas_reliability_events_diagnostics.sql",
  ];
  const sql = ATLAS_RELIABILITY_EVENTS_MIGRATION_SQL;
  const presence = envPresence();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;

  if (input?.apply) {
    const applyResult = await applyMigrationSql(sql);
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      tableExists: false,
      insertOk: false,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      migrationFiles: files,
      sqlPreview: sql.slice(0, 1200),
      probeJobId: null,
      envPresence: presence,
      version,
    };
  }

  const probeJobId = `probe_rel_${Date.now().toString(36)}`;
  const { error: selectError } = await client
    .from("atlas_reliability_events")
    .select("id")
    .limit(1);

  const missing =
    !!selectError &&
    /schema cache|does not exist|Could not find the table/i.test(
      selectError.message,
    );

  if (missing && !appliedViaPostgres && !appliedViaManagementApi) {
    const applyResult = await applyMigrationSql(sql);
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
  }

  // Schema cache can lag briefly after DDL — retry insert a couple times.
  let insertError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await client.from("atlas_reliability_events").insert({
      metric_key: "work_job",
      outcome: "success",
      job_id: probeJobId,
      diagnostic_id: `diag_${probeJobId}`,
      user_id: "__atlas_reliability_probe__",
      stage: "health_probe",
      severity: "info",
      error_code: null,
      message: "reliability schema probe",
      error_message: "reliability schema probe",
      metadata: {
        probe: true,
        note: "no secrets",
        attempt,
      },
    } as never);
    if (!result.error) {
      insertError = null;
      break;
    }
    insertError = result.error;
    if (
      !/schema cache|does not exist|Could not find the table/i.test(
        result.error.message,
      )
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }

  const insertOk = !insertError;
  if (insertError) {
    error = insertError.message;
  } else {
    error = null;
  }

  return {
    ok: insertOk,
    tableExists: insertOk || !missing,
    insertOk,
    appliedViaPostgres,
    appliedViaManagementApi,
    error,
    migrationFiles: files,
    sqlPreview: insertOk ? null : sql.slice(0, 1200),
    probeJobId: insertOk ? probeJobId : null,
    envPresence: presence,
    version,
  };
}
