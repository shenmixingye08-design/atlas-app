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

export type NotificationRetrySchemaProbe = {
  ok: boolean;
  inboxTableOk: boolean;
  dlqTableOk: boolean;
  tickWired: boolean;
  retryDrainReady: boolean;
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
      /schema cache|does not exist|Could not find the table|Could not find the .* column/i.test(
        message,
      ),
  );
}

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

export async function probeNotificationRetrySchema(input?: {
  apply?: boolean;
}): Promise<NotificationRetrySchemaProbe> {
  const version = getHealthVersionPayload();
  const tickWired = tickWiredFromSource();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();

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
      appliedViaPostgres,
      appliedViaManagementApi,
      error: error ?? "supabase_service_role_not_configured",
      envPresence,
      version,
    };
  }

  let tables = await probeTables(client);
  const missing =
    !tables.inboxTableOk ||
    !tables.dlqTableOk ||
    (tables.inboxError && isMissing(tables.inboxError)) ||
    (tables.dlqError && isMissing(tables.dlqError));

  // Auto-apply once when either table is not readable (same pattern as P1-03/P1-04).
  // Service role alone cannot DDL — requires POSTGRES_URL or management token.
  if (missing && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL,
      migrationName: "atlas_notification_retry_dlq",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    tables = await probeTables(client);
  } else if (input?.apply) {
    // Apply already attempted above; re-probe after DDL.
    tables = await probeTables(client);
  }

  const ok = tables.inboxTableOk && tables.dlqTableOk && tickWired;
  return {
    ok,
    inboxTableOk: tables.inboxTableOk,
    dlqTableOk: tables.dlqTableOk,
    tickWired,
    retryDrainReady: ok,
    memoryNotSot: true,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok
      ? null
      : error ??
        tables.inboxError ??
        tables.dlqError ??
        (!tickWired ? "tick_not_wired" : "unavailable"),
    envPresence,
    version,
  };
}
