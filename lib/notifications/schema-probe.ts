import "server-only";

import {
  applyMigrationSql,
  getMigrationEnvPresence,
} from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL } from "./migration-sql";
import {
  runNotificationRetryProductionSmoke,
  type NotificationRetryProductionSmoke,
} from "./production-smoke";

export type NotificationRetrySchemaProbe = {
  ok: boolean;
  inboxTableOk: boolean;
  dlqTableOk: boolean;
  tickWired: boolean;
  retryDrainReady: boolean;
  memoryNotSot: boolean;
  drainSmokeOk: boolean;
  noDoubleSendOk: boolean;
  dlqTerminalOk: boolean;
  dlqNotReinjectedOk: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  ownerHint: string | null;
  smoke: NotificationRetryProductionSmoke | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

function tickWiredFromSource(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), "app/api/automations/tick/route.ts"),
      "utf8",
    );
    return (
      src.includes("processDurableNotificationRetries") &&
      src.includes("notificationRetries")
    );
  } catch {
    return false;
  }
}

async function probeTables(client: NonNullable<
  ReturnType<typeof createServiceRoleClientIfConfigured>
>): Promise<{
  inboxTableOk: boolean;
  dlqTableOk: boolean;
  inboxError: string | null;
  dlqError: string | null;
}> {
  const { error: inboxError } = await client
    .from("atlas_user_notifications")
    .select("notification_id, status, next_retry_at")
    .limit(1);
  const { error: dlqError } = await client
    .from("atlas_notification_dlq")
    .select("id, status")
    .limit(1);

  return {
    inboxTableOk: !inboxError,
    dlqTableOk: !dlqError,
    inboxError: inboxError?.message ?? null,
    dlqError: dlqError?.message ?? null,
  };
}

function ownerHintFor(error: string | null): string | null {
  if (!error) return null;
  if (/schema cache|Could not find the table/i.test(error)) {
    return "Tables may exist but PostgREST cache is stale. In Supabase SQL Editor run: NOTIFY pgrst, 'reload schema'; then re-probe.";
  }
  if (/no_postgres_url_or_management_token/i.test(error)) {
    return "Apply 20260804_p0_4 + 20260726_dlq in the Supabase project linked to Production Vercel, then NOTIFY pgrst, 'reload schema';";
  }
  return "Confirm DDL was applied to the same Supabase project as Production SUPABASE_URL, then NOTIFY pgrst, 'reload schema';";
}

export async function probeNotificationRetrySchema(input?: {
  apply?: boolean;
  smoke?: boolean;
}): Promise<NotificationRetrySchemaProbe> {
  const version = getHealthVersionPayload();
  const tickWired = tickWiredFromSource();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();
  let smoke: NotificationRetryProductionSmoke | null = null;

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL,
      migrationName: "atlas_notification_retry_dlq",
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
      inboxTableOk: false,
      dlqTableOk: false,
      tickWired,
      retryDrainReady: false,
      memoryNotSot: true,
      drainSmokeOk: false,
      noDoubleSendOk: false,
      dlqTerminalOk: false,
      dlqNotReinjectedOk: false,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      ownerHint: "Configure SUPABASE_SERVICE_ROLE_KEY on Production.",
      smoke: null,
      envPresence,
      version,
    };
  }

  let tables = await probeTables(client);
  const missing = !tables.inboxTableOk || !tables.dlqTableOk;
  const tableErrorBeforeApply =
    tables.inboxError ?? tables.dlqError ?? null;

  if (missing && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL,
      migrationName: "atlas_notification_retry_dlq",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    // Prefer PostgREST table error over apply infra error for Owner guidance.
    if (applyResult.error && !tableErrorBeforeApply) {
      error = applyResult.error;
    }
    tables = await probeTables(client);
  } else if (input?.apply) {
    tables = await probeTables(client);
  }

  const tablesOk = tables.inboxTableOk && tables.dlqTableOk;
  if (!tablesOk) {
    error =
      tables.inboxError ??
      tables.dlqError ??
      tableErrorBeforeApply ??
      error ??
      "notification_tables_unavailable";
  }

  const runSmoke = Boolean(input?.smoke ?? true);
  if (tablesOk && tickWired && runSmoke) {
    smoke = await runNotificationRetryProductionSmoke();
    if (!smoke.ok && !error) error = smoke.error;
  }

  const drainSmokeOk = Boolean(smoke?.drainOk);
  const noDoubleSendOk = Boolean(smoke?.noDoubleSendOk);
  const dlqTerminalOk = Boolean(smoke?.dlqTerminalOk);
  const dlqNotReinjectedOk = Boolean(smoke?.dlqNotReinjectedOk);
  const retryDrainReady =
    tablesOk &&
    tickWired &&
    drainSmokeOk &&
    noDoubleSendOk &&
    dlqTerminalOk &&
    dlqNotReinjectedOk;
  const ok = retryDrainReady;

  return {
    ok,
    inboxTableOk: tables.inboxTableOk,
    dlqTableOk: tables.dlqTableOk,
    tickWired,
    retryDrainReady,
    memoryNotSot: true,
    drainSmokeOk,
    noDoubleSendOk,
    dlqTerminalOk,
    dlqNotReinjectedOk,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok
      ? null
      : error ??
        (!tickWired ? "tick_not_wired" : "unavailable"),
    ownerHint: ok ? null : ownerHintFor(error),
    smoke,
    envPresence,
    version,
  };
}
