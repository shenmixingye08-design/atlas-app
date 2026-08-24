import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_X_POST_BATCH_MIGRATION_SQL } from "./batch-migration-sql";

export type XPostBatchSchemaProbe = {
  ok: boolean;
  batchesTableOk: boolean;
  itemsTableOk: boolean;
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
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

export async function probeXPostBatchSchema(input?: {
  apply?: boolean;
}): Promise<XPostBatchSchemaProbe> {
  const version = getHealthVersionPayload();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_X_POST_BATCH_MIGRATION_SQL,
      migrationName: "atlas_x_post_batches",
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
      batchesTableOk: false,
      itemsTableOk: false,
      memoryNotSot: true,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  let { error: batchError } = await client
    .from("atlas_x_post_batches")
    .select("batch_id, owner_id, status")
    .limit(1);

  if (batchError && isMissing(batchError.message) && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_X_POST_BATCH_MIGRATION_SQL,
      migrationName: "atlas_x_post_batches",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
    const retry = await client
      .from("atlas_x_post_batches")
      .select("batch_id, owner_id, status")
      .limit(1);
    batchError = retry.error;
  }

  const { error: itemError } = await client
    .from("atlas_x_post_batch_items")
    .select("item_id, batch_id, owner_id")
    .limit(1);

  const batchesTableOk = !batchError;
  const itemsTableOk = !itemError;
  if (batchError && !error) error = batchError.message;
  if (itemError && !error) error = itemError.message;

  return {
    ok: batchesTableOk && itemsTableOk,
    batchesTableOk,
    itemsTableOk,
    memoryNotSot: true,
    appliedViaPostgres,
    appliedViaManagementApi,
    error,
    envPresence,
    version,
  };
}
