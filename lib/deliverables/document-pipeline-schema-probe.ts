import "server-only";

import {
  applyMigrationSql,
  getMigrationEnvPresence,
} from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_DOCUMENT_PIPELINE_MIGRATION_SQL } from "./document-pipeline-migration-sql";

export type DocumentPipelineSchemaProbe = {
  ok: boolean;
  tableOk: boolean;
  memoryNotSot: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  ownerHint: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  commitShaShort: string;
  environment: string;
};

async function probeTable(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await client
    .from("atlas_document_generation_jobs" as never)
    .select("id")
    .limit(1);
  return { ok: !error, error: error?.message ?? null };
}

function ownerHintFor(error: string | null): string | null {
  if (!error) return null;
  if (/schema cache|Could not find the table/i.test(error)) {
    return "Apply /api/health/document-pipeline?apply=1 (CRON) then NOTIFY pgrst, 'reload schema' if cache still stale.";
  }
  if (/no_postgres_url_or_management_token/i.test(error)) {
    return "Configure DATABASE_URL/POSTGRES_URL or SUPABASE_ACCESS_TOKEN on Production for apply=1.";
  }
  return "Confirm P0-7 DDL on the Production Supabase project, then reload PostgREST schema.";
}

export async function probeDocumentPipelineSchema(input?: {
  apply?: boolean;
}): Promise<DocumentPipelineSchemaProbe> {
  const version = getHealthVersionPayload();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_DOCUMENT_PIPELINE_MIGRATION_SQL,
      migrationName: "atlas_document_generation_pipeline_p0_7",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      tableOk: false,
      memoryNotSot: true,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      ownerHint: "Configure SUPABASE_SERVICE_ROLE_KEY on Production.",
      envPresence,
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  }

  // Probe after optional apply (CRON/owner gated by health route).
  const table = await probeTable(client);
  if (!table.ok) {
    error = error ?? table.error ?? "document_pipeline_schema_missing";
  }

  const tableOk = table.ok;
  const ok = tableOk;
  return {
    ok,
    tableOk,
    memoryNotSot: tableOk,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok ? null : error,
    ownerHint: ok ? null : ownerHintFor(error ?? table.error),
    envPresence,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}
