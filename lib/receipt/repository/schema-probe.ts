import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import {
  ATLAS_HOUSEHOLD_LEDGER_MIGRATION_SQL,
  HOUSEHOLD_LEDGER_MIGRATION_NAME,
  HOUSEHOLD_LEDGER_TABLE,
} from "./migration-sql";
import { markHouseholdLedgerTableReadyUnknown } from "./table-ready";

export type HouseholdLedgerSchemaProbe = {
  ok: boolean;
  ledgerTableOk: boolean;
  dbSotReady: boolean;
  legacyLimitRemoved: boolean;
  memoryNotSot: boolean;
  ownershipOk: boolean;
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

/** Static code-level guarantees encoded into the probe response. */
function staticGuarantees(): {
  legacyLimitRemoved: boolean;
  memoryNotSot: boolean;
  ownershipOk: boolean;
} {
  return {
    // Entries are no longer compacted with MAX_CLERK_ENTRIES=40 as SoT.
    legacyLimitRemoved: true,
    // Process Map is cache only; durable SoT is the dedicated table.
    memoryNotSot: true,
    // Repository CRUD always scopes by user_id.
    ownershipOk: true,
  };
}

export async function probeHouseholdLedgerSchema(input?: {
  apply?: boolean;
}): Promise<HouseholdLedgerSchemaProbe> {
  const version = getHealthVersionPayload();
  const guarantees = staticGuarantees();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_HOUSEHOLD_LEDGER_MIGRATION_SQL,
      migrationName: HOUSEHOLD_LEDGER_MIGRATION_NAME,
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    markHouseholdLedgerTableReadyUnknown();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      ledgerTableOk: false,
      dbSotReady: false,
      ...guarantees,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  const { error: probeErr } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select(
      "id, user_id, amount, currency, occurred_at, occurred_on, category, merchant, source, receipt_id, created_at, updated_at",
    )
    .limit(1);

  if (probeErr && isMissing(probeErr.message) && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_HOUSEHOLD_LEDGER_MIGRATION_SQL,
      migrationName: HOUSEHOLD_LEDGER_MIGRATION_NAME,
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
    markHouseholdLedgerTableReadyUnknown();
  }

  const { error: tableError } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select(
      "id, user_id, amount, currency, occurred_at, occurred_on, category, merchant, source, receipt_id, created_at, updated_at",
    )
    .limit(1);

  const ledgerTableOk = !tableError;
  if (!ledgerTableOk && tableError) {
    error = error ?? tableError.message;
  }

  const ok = ledgerTableOk;
  if (ok) markHouseholdLedgerTableReadyUnknown();

  return {
    ok,
    ledgerTableOk,
    dbSotReady: ok,
    ...guarantees,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok ? null : error,
    envPresence,
    version,
  };
}
