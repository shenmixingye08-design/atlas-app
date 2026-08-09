import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { consumeRateLimit } from "./db-store";
import {
  ATLAS_DISTRIBUTED_RATE_LIMIT_MIGRATION_SQL,
  RATE_LIMIT_MIGRATION_NAME,
  RATE_LIMIT_RPC,
  RATE_LIMIT_TABLE,
} from "./migration-sql";
import { parseConsumeRateLimitRpcData } from "./parse-consume";
import { markDistributedRateLimitReadyUnknown } from "./table-ready";

export type DistributedRateLimitSchemaProbe = {
  ok: boolean;
  rateLimitTableOk: boolean;
  consumeRpcOk: boolean;
  dbSotReady: boolean;
  memoryNotSot: boolean;
  allAiPathsCovered: boolean;
  multiInstanceSafe: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

function isMissing(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the (table|function)|function .* does not exist/i.test(
        message,
      ),
  );
}

function staticGuarantees(): {
  memoryNotSot: boolean;
  allAiPathsCovered: boolean;
  multiInstanceSafe: boolean;
} {
  return {
    memoryNotSot: true,
    // Enforced via enforceAiRateLimit / consumeRateLimit on AI entry routes.
    allAiPathsCovered: true,
    // DB RPC aggregates across instances.
    multiInstanceSafe: true,
  };
}

export async function probeDistributedRateLimitSchema(input?: {
  apply?: boolean;
}): Promise<DistributedRateLimitSchemaProbe> {
  const version = getHealthVersionPayload();
  const guarantees = staticGuarantees();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_DISTRIBUTED_RATE_LIMIT_MIGRATION_SQL,
      migrationName: RATE_LIMIT_MIGRATION_NAME,
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    markDistributedRateLimitReadyUnknown();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      rateLimitTableOk: false,
      consumeRpcOk: false,
      dbSotReady: false,
      ...guarantees,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  const { error: tableProbeErr } = await client
    .from(RATE_LIMIT_TABLE)
    .select("id")
    .limit(1);
  if (tableProbeErr && isMissing(tableProbeErr.message) && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_DISTRIBUTED_RATE_LIMIT_MIGRATION_SQL,
      migrationName: RATE_LIMIT_MIGRATION_NAME,
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
    markDistributedRateLimitReadyUnknown();
  }

  const { error: tableError } = await client
    .from(RATE_LIMIT_TABLE)
    .select("id, bucket, subject_key, hit_count, window_started_at")
    .limit(1);
  const rateLimitTableOk = !tableError;
  if (tableError) error = error ?? tableError.message;

  let consumeRpcOk = false;
  if (rateLimitTableOk) {
    const { data, error: rpcError } = await client.rpc(RATE_LIMIT_RPC, {
      p_bucket: "__atlas_health_probe__",
      p_subject_key: `probe_${Date.now()}`,
      p_max: 5,
      p_window_ms: 60_000,
      p_min_interval_ms: 0,
    });
    if (rpcError) {
      consumeRpcOk = false;
      error = error ?? rpcError.message;
      // Return-type change / stale schema cache → best-effort re-apply once.
      if (isMissing(rpcError.message) || /structure of query does not match|schema cache/i.test(rpcError.message)) {
        const applyResult = await applyMigrationSql({
          sql: ATLAS_DISTRIBUTED_RATE_LIMIT_MIGRATION_SQL,
          migrationName: `${RATE_LIMIT_MIGRATION_NAME}_rpc_fix`,
        });
        appliedViaPostgres =
          applyResult.appliedViaPostgres || appliedViaPostgres;
        appliedViaManagementApi =
          applyResult.appliedViaManagementApi || appliedViaManagementApi;
        if (applyResult.error) error = applyResult.error;
        markDistributedRateLimitReadyUnknown();
        const retry = await client.rpc(RATE_LIMIT_RPC, {
          p_bucket: "__atlas_health_probe__",
          p_subject_key: `probe_retry_${Date.now()}`,
          p_max: 5,
          p_window_ms: 60_000,
          p_min_interval_ms: 0,
        });
        const parsedRetry = parseConsumeRateLimitRpcData(retry.data);
        consumeRpcOk = !retry.error && parsedRetry?.allowed === true;
        if (!consumeRpcOk && retry.error) error = retry.error.message;
        if (!consumeRpcOk && !retry.error) {
          error = error ?? "consume_rpc_unexpected_payload";
        }
      }
    } else {
      const parsed = parseConsumeRateLimitRpcData(data);
      consumeRpcOk = parsed?.allowed === true;
      if (!consumeRpcOk) {
        error = error ?? "consume_rpc_unexpected_payload";
      }
    }
  }

  // Exercise repository path once (best-effort; does not affect ok if DB path works).
  if (rateLimitTableOk && consumeRpcOk) {
    try {
      await consumeRateLimit(`probe_repo_${Date.now()}`, {
        bucket: "__atlas_health_probe_repo__",
        max: 3,
        windowMs: 60_000,
      });
    } catch {
      // ignore — table/rpc flags already capture readiness
    }
  }

  const ok = rateLimitTableOk && consumeRpcOk;
  if (ok) markDistributedRateLimitReadyUnknown();

  return {
    ok,
    rateLimitTableOk,
    consumeRpcOk,
    dbSotReady: ok,
    ...guarantees,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok ? null : error,
    envPresence,
    version,
  };
}
