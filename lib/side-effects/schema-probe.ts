import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_SIDE_EFFECT_IDEMPOTENCY_MIGRATION_SQL } from "./migration-sql";
import { markSideEffectIdempotencyReadyUnknown } from "./table-ready";

export type SideEffectSchemaProbe = {
  ok: boolean;
  claimsTableOk: boolean;
  claimRpcOk: boolean;
  durableIdempotencyReady: boolean;
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
      /schema cache|does not exist|Could not find the table|function .* does not exist/i.test(
        message,
      ),
  );
}

export async function probeSideEffectIdempotencySchema(input?: {
  apply?: boolean;
}): Promise<SideEffectSchemaProbe> {
  const version = getHealthVersionPayload();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_SIDE_EFFECT_IDEMPOTENCY_MIGRATION_SQL,
      migrationName: "atlas_side_effect_idempotency",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    markSideEffectIdempotencyReadyUnknown();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      claimsTableOk: false,
      claimRpcOk: false,
      durableIdempotencyReady: false,
      memoryNotSot: true,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  const { error: tableError } = await client
    .from("atlas_side_effect_claims")
    .select("id, status, idempotency_key")
    .limit(1);

  if (tableError && isMissing(tableError.message) && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_SIDE_EFFECT_IDEMPOTENCY_MIGRATION_SQL,
      migrationName: "atlas_side_effect_idempotency",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
    markSideEffectIdempotencyReadyUnknown();
  }

  const { error: tableError2 } = await client
    .from("atlas_side_effect_claims")
    .select("id, status, idempotency_key")
    .limit(1);
  const claimsTableOk = !tableError2;

  // RPC presence: call with impossible id; missing function → not ok.
  let claimRpcOk = false;
  const { error: rpcError } = await client.rpc("atlas_claim_side_effect", {
    p_id: "__probe_missing__",
    p_user_id: "__probe__",
    p_lease_owner: "probe",
    p_lease_ms: 1000,
  });
  if (!rpcError) {
    claimRpcOk = true;
  } else if (!isMissing(rpcError.message)) {
    // e.g. null return / permission — function exists
    claimRpcOk = !/function .* does not exist/i.test(rpcError.message);
  }

  const ok = claimsTableOk && claimRpcOk;
  if (ok) markSideEffectIdempotencyReadyUnknown();

  return {
    ok,
    claimsTableOk,
    claimRpcOk,
    durableIdempotencyReady: ok,
    memoryNotSot: true,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok
      ? null
      : error ?? tableError2?.message ?? rpcError?.message ?? "unavailable",
    envPresence,
    version,
  };
}
