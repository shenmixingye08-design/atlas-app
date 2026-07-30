import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { ATLAS_RELIABILITY_EVENTS_MIGRATION_SQL } from "./migration-sql";

export type ReliabilitySchemaProbe = {
  ok: boolean;
  tableExists: boolean;
  insertOk: boolean;
  appliedViaPostgres: boolean;
  error: string | null;
  migrationFiles: string[];
  sqlPreview: string | null;
  probeJobId: string | null;
  version: ReturnType<typeof getHealthVersionPayload>;
};

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
    const pg = await import("pg");
    const client = new pg.Client({
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

/**
 * Ensure atlas_reliability_events exists (apply when Postgres URL present),
 * then probe a service-role INSERT of a safe diagnostic row.
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
  let appliedViaPostgres = false;
  let error: string | null = null;

  if (input?.apply) {
    const applyResult = await tryApplyViaPostgres(sql);
    appliedViaPostgres = applyResult.applied;
    if (applyResult.error) error = applyResult.error;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      tableExists: false,
      insertOk: false,
      appliedViaPostgres,
      error: error ?? "supabase_service_role_not_configured",
      migrationFiles: files,
      sqlPreview: sql.slice(0, 1200),
      probeJobId: null,
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

  if (missing && !appliedViaPostgres) {
    const applyResult = await tryApplyViaPostgres(sql);
    appliedViaPostgres = applyResult.applied;
    if (applyResult.error) error = applyResult.error;
  }

  const { error: insertError } = await client
    .from("atlas_reliability_events")
    .insert({
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
      },
    } as never);

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
    error,
    migrationFiles: files,
    sqlPreview: insertOk ? null : sql.slice(0, 1200),
    probeJobId: insertOk ? probeJobId : null,
    version,
  };
}
