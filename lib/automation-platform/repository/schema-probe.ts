import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_AUTOMATION_V2_DB_SOT_MIGRATION_SQL } from "./migration-sql";
import { markAutomationV2DbSotReadyUnknown } from "./table-ready";

export type AutomationV2SchemaProbe = {
  ok: boolean;
  automationsTableOk: boolean;
  runsTableOk: boolean;
  runsPayloadColumnOk: boolean;
  dbSotReady: boolean;
  memoryNotSot: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

function isMissing(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table|column /i.test(
        message,
      ),
  );
}

export async function probeAutomationV2DbSotSchema(input?: {
  apply?: boolean;
}): Promise<AutomationV2SchemaProbe> {
  const version = getHealthVersionPayload();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_AUTOMATION_V2_DB_SOT_MIGRATION_SQL,
      migrationName: "atlas_automation_v2_db_sot",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    markAutomationV2DbSotReadyUnknown();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      automationsTableOk: false,
      runsTableOk: false,
      runsPayloadColumnOk: false,
      dbSotReady: false,
      memoryNotSot: true,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  if (
    (!appliedViaPostgres && !appliedViaManagementApi) ||
    input?.apply
  ) {
    // Best-effort ensure when tables missing.
    const { error: probeErr } = await client
      .from("atlas_automations")
      .select("id")
      .limit(1);
    if (probeErr && isMissing(probeErr.message)) {
      const applyResult = await applyMigrationSql({
        sql: ATLAS_AUTOMATION_V2_DB_SOT_MIGRATION_SQL,
        migrationName: "atlas_automation_v2_db_sot",
      });
      appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
      appliedViaManagementApi =
        applyResult.appliedViaManagementApi || appliedViaManagementApi;
      if (applyResult.error) error = applyResult.error;
      markAutomationV2DbSotReadyUnknown();
    }
  }

  const { error: automationsError } = await client
    .from("atlas_automations")
    .select("id")
    .limit(1);
  const automationsTableOk = !automationsError;

  const { error: runsError } = await client
    .from("atlas_automation_runs")
    .select("id, payload, next_retry_at")
    .limit(1);
  const runsTableOk =
    !runsError ||
    (/column .*payload|next_retry_at/i.test(runsError.message ?? "") &&
      !isMissing(runsError.message));
  const runsPayloadColumnOk = !runsError;

  const ok = automationsTableOk && runsTableOk && runsPayloadColumnOk;
  if (ok) markAutomationV2DbSotReadyUnknown();

  return {
    ok,
    automationsTableOk,
    runsTableOk,
    runsPayloadColumnOk,
    dbSotReady: ok,
    memoryNotSot: true,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok ? null : error ?? automationsError?.message ?? runsError?.message ?? "unavailable",
    envPresence,
    version,
  };
}
