/**
 * Read-only probe + authorized apply for the billing usage increment RPC.
 * Never increments a real customer meter.
 */

import "server-only";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { readUnknownSupabaseError } from "@/lib/persistence/durable-read-log";

import {
  ATLAS_BILLING_USAGE_INCREMENT_RPC_SQL,
  ATLAS_INCREMENT_USAGE_RPC_ARG_NAMES,
  ATLAS_INCREMENT_USAGE_RPC_MIGRATION_FILE,
  ATLAS_INCREMENT_USAGE_RPC_NAME,
  buildIncrementUsageRpcArgs,
} from "./increment-once-sql";
import { asUntypedSupabase } from "./untyped-supabase";

export type UsageIncrementRpcErrorCode =
  | "usage_unavailable"
  | "usage_increment_failed"
  | "usage_rpc_missing";

export type UsageIncrementRpcProbe = {
  ok: boolean;
  rpcReady: boolean;
  countersReady: boolean;
  claimsReady: boolean;
  signatureMatches: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  errorCode: UsageIncrementRpcErrorCode | null;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
};

let ensurePromise: Promise<UsageIncrementRpcProbe> | null = null;
let lastEnsureOkAtMs = 0;
const ENSURE_OK_TTL_MS = 5 * 60_000;

export function isMissingUsageIncrementRpc(error: unknown): boolean {
  const parsed = readUnknownSupabaseError(error);
  const haystack = `${parsed.code ?? ""} ${parsed.message}`;
  return /PGRST202|Could not find the function|function .*atlas_increment_usage_counter_once|atlas_sync_ai_runs_from_claims/i.test(
    haystack,
  );
}

export function classifyUsageIncrementFailure(
  error: unknown,
): UsageIncrementRpcErrorCode {
  return isMissingUsageIncrementRpc(error)
    ? "usage_rpc_missing"
    : "usage_increment_failed";
}

async function probeTables(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<{ countersReady: boolean; claimsReady: boolean; error: string | null }> {
  const untyped = asUntypedSupabase(client);
  const counters = await untyped
    .from("atlas_billing_usage_counters")
    .select("ai_runs, sns_posts, x_url_posts, wordpress_posts")
    .eq("user_id", "__atlas_usage_rpc_probe__")
    .eq("month_key", "1970-01")
    .maybeSingle();
  if (counters.error) {
    return {
      countersReady: false,
      claimsReady: false,
      error: readUnknownSupabaseError(counters.error).message,
    };
  }

  const claims = await untyped
    .from("atlas_billing_usage_claims")
    .select("claim_key")
    .eq("user_id", "__atlas_usage_rpc_probe__")
    .maybeSingle();
  if (claims.error) {
    return {
      countersReady: true,
      claimsReady: false,
      error: readUnknownSupabaseError(claims.error).message,
    };
  }
  return { countersReady: true, claimsReady: true, error: null };
}

async function probeIncrementSignature(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<{ rpcReady: boolean; signatureMatches: boolean; error: string | null }> {
  const untyped = asUntypedSupabase(client);

  const probe = await untyped.rpc("atlas_probe_usage_increment_rpc");
  if (!probe.error && probe.data && typeof probe.data === "object") {
    const row = probe.data as { ok?: boolean; expectedArgNames?: unknown };
    const expected = Array.isArray(row.expectedArgNames)
      ? row.expectedArgNames.every(
          (name, index) => name === ATLAS_INCREMENT_USAGE_RPC_ARG_NAMES[index],
        )
      : true;
    return {
      rpcReady: Boolean(row.ok),
      signatureMatches: Boolean(row.ok) && expected,
      error: row.ok ? null : "usage_rpc_signature_mismatch",
    };
  }

  // Empty user_id raises before any write. Exact app argument names.
  const emptyCall = await untyped.rpc(
    ATLAS_INCREMENT_USAGE_RPC_NAME,
    buildIncrementUsageRpcArgs({
      userId: "",
      monthKey: "1970-01",
      claimKey: "probe",
      meter: "ai_runs",
      amount: 1,
    }),
  );
  if (!emptyCall.error) {
    return { rpcReady: true, signatureMatches: true, error: null };
  }
  const message = readUnknownSupabaseError(emptyCall.error).message;
  if (/user_id required/i.test(message)) {
    return { rpcReady: true, signatureMatches: true, error: null };
  }
  if (isMissingUsageIncrementRpc(emptyCall.error)) {
    return {
      rpcReady: false,
      signatureMatches: false,
      error: "usage_rpc_missing",
    };
  }
  return {
    rpcReady: false,
    signatureMatches: false,
    error: message || "usage_increment_failed",
  };
}

export async function probeBillingUsageIncrementRpc(input?: {
  apply?: boolean;
}): Promise<UsageIncrementRpcProbe> {
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let applyError: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applied = await applyMigrationSql({
      sql: ATLAS_BILLING_USAGE_INCREMENT_RPC_SQL,
      migrationName: ATLAS_INCREMENT_USAGE_RPC_MIGRATION_FILE.replace(
        /\.sql$/,
        "",
      ),
    });
    appliedViaPostgres = applied.appliedViaPostgres;
    appliedViaManagementApi = applied.appliedViaManagementApi;
    envPresence = applied.envPresence;
    applyError = applied.error;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      rpcReady: false,
      countersReady: false,
      claimsReady: false,
      signatureMatches: false,
      appliedViaPostgres,
      appliedViaManagementApi,
      errorCode: "usage_unavailable",
      error: applyError ?? "supabase_service_role_not_configured",
      envPresence,
    };
  }

  let tables = await probeTables(client);
  let rpc = await probeIncrementSignature(client);

  if ((!tables.countersReady || !rpc.rpcReady) && input?.apply) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      tables = await probeTables(client);
      rpc = await probeIncrementSignature(client);
      if (tables.countersReady && rpc.rpcReady && rpc.signatureMatches) break;
    }
  }

  const ok =
    tables.countersReady &&
    tables.claimsReady &&
    rpc.rpcReady &&
    rpc.signatureMatches;
  const error = ok ? null : applyError ?? rpc.error ?? tables.error;
  return {
    ok,
    rpcReady: rpc.rpcReady,
    countersReady: tables.countersReady,
    claimsReady: tables.claimsReady,
    signatureMatches: rpc.signatureMatches,
    appliedViaPostgres,
    appliedViaManagementApi,
    errorCode: ok
      ? null
      : error === "usage_rpc_missing"
        ? "usage_rpc_missing"
        : "usage_unavailable",
    error,
    envPresence,
  };
}

/** Apply missing RPC at most once per TTL. Safe on the increment failure path. */
export async function ensureBillingUsageIncrementRpc(): Promise<UsageIncrementRpcProbe> {
  if (Date.now() - lastEnsureOkAtMs < ENSURE_OK_TTL_MS) {
    return {
      ok: true,
      rpcReady: true,
      countersReady: true,
      claimsReady: true,
      signatureMatches: true,
      appliedViaPostgres: false,
      appliedViaManagementApi: false,
      errorCode: null,
      error: null,
      envPresence: getMigrationEnvPresence(),
    };
  }
  if (!ensurePromise) {
    ensurePromise = probeBillingUsageIncrementRpc({ apply: true }).finally(
      () => {
        ensurePromise = null;
      },
    );
  }
  const result = await ensurePromise;
  if (result.ok) lastEnsureOkAtMs = Date.now();
  return result;
}

export function resetUsageIncrementRpcEnsureForTests(): void {
  ensurePromise = null;
  lastEnsureOkAtMs = 0;
}
