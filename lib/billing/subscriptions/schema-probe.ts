import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  applyMigrationSql,
  getMigrationEnvPresence,
} from "@/lib/supabase/apply-migration-sql";

import { ATLAS_BILLING_SUBSCRIPTIONS_MIGRATION_SQL } from "./migration-sql";

export type BillingSchemaProbe = {
  ok: boolean;
  subscriptionsTableExists: boolean;
  webhookEventsTableExists: boolean;
  selectOk: boolean;
  upsertOk: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  /** When dedicated tables are missing, runtime uses atlas_user_state. */
  usingDurableFallback: boolean;
  error: string | null;
  migrationFiles: string[];
  sqlPreview: string | null;
  envPresence: {
    serviceRole: boolean;
    postgresUrl: boolean;
    supabaseAccessToken: boolean;
    projectRef: string | null;
    postgresEnvKeys: string[];
  };
  version: ReturnType<typeof getHealthVersionPayload>;
};

let ensurePromise: Promise<BillingSchemaProbe> | null = null;
let lastEnsureOkAtMs = 0;
let lastEnsureFailAtMs = 0;
const ENSURE_OK_TTL_MS = 5 * 60_000;
const ENSURE_FAIL_TTL_MS = 2 * 60_000;

function isMissingTableError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function probeTables(client: NonNullable<
  ReturnType<typeof createServiceRoleClientIfConfigured>
>): Promise<{
  subscriptionsTableExists: boolean;
  webhookEventsTableExists: boolean;
  selectOk: boolean;
  upsertOk: boolean;
  error: string | null;
}> {
  const probeUserId = `__atlas_billing_schema_probe__`;
  const { error: selectError } = await client
    .from("atlas_billing_subscriptions")
    .select("user_id")
    .eq("user_id", probeUserId)
    .maybeSingle();

  const subscriptionsMissing = isMissingTableError(selectError?.message);
  if (subscriptionsMissing) {
    return {
      subscriptionsTableExists: false,
      webhookEventsTableExists: false,
      selectOk: false,
      upsertOk: false,
      error: selectError?.message ?? "subscriptions_table_missing",
    };
  }
  if (selectError) {
    return {
      subscriptionsTableExists: true,
      webhookEventsTableExists: false,
      selectOk: false,
      upsertOk: false,
      error: selectError.message,
    };
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await client
    .from("atlas_billing_subscriptions")
    .upsert(
      {
        user_id: probeUserId,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        plan_id: "free",
        status: "active",
        current_period_start: now,
        current_period_end: null,
        cancel_at_period_end: false,
        updated_at: now,
        automations_suspended: null,
        payment_failure_grace_ends_at: null,
        plan_profile_synced_at: null,
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    return {
      subscriptionsTableExists: true,
      webhookEventsTableExists: false,
      selectOk: true,
      upsertOk: false,
      error: upsertError.message,
    };
  }

  // Cleanup probe row (best-effort).
  await client
    .from("atlas_billing_subscriptions")
    .delete()
    .eq("user_id", probeUserId);

  const { error: webhookError } = await client
    .from("atlas_stripe_webhook_events")
    .select("event_id")
    .limit(1);

  const webhookMissing = isMissingTableError(webhookError?.message);
  return {
    subscriptionsTableExists: true,
    webhookEventsTableExists: !webhookMissing,
    selectOk: true,
    upsertOk: true,
    error: webhookMissing
      ? webhookError?.message ?? "webhook_events_table_missing"
      : null,
  };
}

/**
 * Ensure billing tables exist (apply DDL when Postgres URL / Management token
 * present), then probe service-role SELECT + UPSERT.
 */
export async function probeBillingSubscriptionsSchema(input?: {
  apply?: boolean;
}): Promise<BillingSchemaProbe> {
  const version = getHealthVersionPayload();
  const files = ["20260713_atlas_billing_subscriptions.sql"];
  const sql = ATLAS_BILLING_SUBSCRIPTIONS_MIGRATION_SQL;
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql,
      migrationName: "atlas_billing_subscriptions",
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
      subscriptionsTableExists: false,
      webhookEventsTableExists: false,
      selectOk: false,
      upsertOk: false,
      appliedViaPostgres,
      appliedViaManagementApi,
      usingDurableFallback: true,
      error: error ?? "supabase_service_role_not_configured",
      migrationFiles: files,
      sqlPreview: sql.slice(0, 1200),
      envPresence,
      version,
    };
  }

  let probe = await probeTables(client);

  if (
    (!probe.subscriptionsTableExists || !probe.webhookEventsTableExists) &&
    !appliedViaPostgres &&
    !appliedViaManagementApi
  ) {
    const applyResult = await applyMigrationSql({
      sql,
      migrationName: "atlas_billing_subscriptions",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;

    // Schema cache can lag briefly after DDL.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      probe = await probeTables(client);
      if (probe.subscriptionsTableExists && probe.upsertOk) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  const ok =
    probe.subscriptionsTableExists &&
    probe.webhookEventsTableExists &&
    probe.selectOk &&
    probe.upsertOk;

  if (ok) {
    const { markBillingDedicatedTableReadyUnknown } = await import(
      "./table-ready"
    );
    markBillingDedicatedTableReadyUnknown();
  }

  return {
    ok,
    subscriptionsTableExists: probe.subscriptionsTableExists,
    webhookEventsTableExists: probe.webhookEventsTableExists,
    selectOk: probe.selectOk,
    upsertOk: probe.upsertOk,
    appliedViaPostgres,
    appliedViaManagementApi,
    usingDurableFallback: !ok,
    error: ok ? null : error ?? probe.error,
    migrationFiles: files,
    sqlPreview: ok ? null : sql.slice(0, 1200),
    envPresence,
    version,
  };
}

/**
 * Ensure billing schema once (coalesced). Safe to call from request path.
 * Returns whether the dedicated subscriptions table is usable.
 */
export async function ensureBillingSubscriptionsSchema(): Promise<boolean> {
  if (Date.now() - lastEnsureOkAtMs < ENSURE_OK_TTL_MS) {
    return true;
  }
  if (Date.now() - lastEnsureFailAtMs < ENSURE_FAIL_TTL_MS) {
    return false;
  }
  if (!ensurePromise) {
    ensurePromise = probeBillingSubscriptionsSchema({ apply: true }).finally(
      () => {
        ensurePromise = null;
      },
    );
  }
  const result = await ensurePromise;
  if (result.ok) {
    lastEnsureOkAtMs = Date.now();
  } else {
    lastEnsureFailAtMs = Date.now();
    console.error("[billing] schema ensure failed", {
      error: result.error,
      appliedViaPostgres: result.appliedViaPostgres,
      appliedViaManagementApi: result.appliedViaManagementApi,
      envPresence: result.envPresence,
      migrationFiles: result.migrationFiles,
    });
  }
  return result.ok;
}
