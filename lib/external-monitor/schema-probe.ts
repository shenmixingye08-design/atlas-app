import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_EXTERNAL_MONITOR_MIGRATION_SQL } from "./migration-sql";
import { markExternalMonitorReadyUnknown } from "./table-ready";
import { runExternalMonitorProductionSmoke } from "./production-smoke";

export type ExternalMonitorSchemaProbe = {
  ok: boolean;
  incidentsTableOk: boolean;
  deliveriesTableOk: boolean;
  checkRunsTableOk: boolean;
  injectionsTableOk: boolean;
  claimRpcOk: boolean;
  durableReady: boolean;
  memoryNotSot: boolean;
  tickWired: boolean;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  smokeOk: boolean;
  error: string | null;
  ownerHint: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
  smoke: Awaited<ReturnType<typeof runExternalMonitorProductionSmoke>> | null;
};

function isMissing(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table|function .* does not exist/i.test(
        message,
      ),
  );
}

async function tableOk(table: string): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;
  const { error } = await client.from(table).select("id").limit(1);
  return !error;
}

function tickWired(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), "lib/automations/tick-runner.ts"),
      "utf8",
    );
    return (
      src.includes("runExternalMonitorCycle") &&
      src.includes("externalMonitor")
    );
  } catch {
    return false;
  }
}

export async function probeExternalMonitorSchema(input?: {
  apply?: boolean;
  smoke?: boolean;
}): Promise<ExternalMonitorSchemaProbe> {
  const version = getHealthVersionPayload();
  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let error: string | null = null;
  let envPresence = getMigrationEnvPresence();
  let ownerHint: string | null = null;

  if (input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_EXTERNAL_MONITOR_MIGRATION_SQL,
      migrationName: "atlas_external_monitor_alerts",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres;
    appliedViaManagementApi = applyResult.appliedViaManagementApi;
    envPresence = applyResult.envPresence;
    if (applyResult.error) error = applyResult.error;
    markExternalMonitorReadyUnknown();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      incidentsTableOk: false,
      deliveriesTableOk: false,
      checkRunsTableOk: false,
      injectionsTableOk: false,
      claimRpcOk: false,
      durableReady: false,
      memoryNotSot: true,
      tickWired: tickWired(),
      appliedViaPostgres,
      appliedViaManagementApi,
      smokeOk: false,
      error: error ?? "supabase_service_role_not_configured",
      ownerHint: "Configure Supabase service role for Production monitoring SoT.",
      envPresence,
      version,
      smoke: null,
    };
  }

  let incidentsTableOk = await tableOk("atlas_alert_incidents");
  if (!incidentsTableOk && !input?.apply) {
    const applyResult = await applyMigrationSql({
      sql: ATLAS_EXTERNAL_MONITOR_MIGRATION_SQL,
      migrationName: "atlas_external_monitor_alerts",
    });
    appliedViaPostgres = applyResult.appliedViaPostgres || appliedViaPostgres;
    appliedViaManagementApi =
      applyResult.appliedViaManagementApi || appliedViaManagementApi;
    if (applyResult.error) error = applyResult.error;
    markExternalMonitorReadyUnknown();
    incidentsTableOk = await tableOk("atlas_alert_incidents");
  }

  const deliveriesTableOk = await tableOk("atlas_alert_deliveries");
  const checkRunsTableOk = await tableOk("atlas_monitor_check_runs");
  const injectionsTableOk = await tableOk("atlas_monitor_injections");

  let claimRpcOk = false;
  const { error: rpcError } = await client.rpc("atlas_claim_alert_delivery", {
    p_id: `__probe_${Date.now()}`,
    p_incident_id: "__probe_missing__",
    p_delivery_kind: "opened",
    p_channel: "probe",
    p_dedupe_key: `probe_rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    p_claimed_by: "schema_probe",
  });
  if (!rpcError) {
    claimRpcOk = true;
  } else if (!isMissing(rpcError.message)) {
    claimRpcOk = true;
  } else {
    error = error ?? rpcError.message;
  }

  const durableReady =
    incidentsTableOk &&
    deliveriesTableOk &&
    checkRunsTableOk &&
    injectionsTableOk &&
    claimRpcOk;

  if (durableReady) markExternalMonitorReadyUnknown();

  let smoke: Awaited<ReturnType<typeof runExternalMonitorProductionSmoke>> | null =
    null;
  let smokeOk = false;
  if (input?.smoke !== false && durableReady) {
    try {
      smoke = await runExternalMonitorProductionSmoke();
      smokeOk = smoke.ok;
      if (!smoke.ok) error = error ?? smoke.error;
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : "smoke_failed");
      smokeOk = false;
    }
  }

  if (!durableReady) {
    ownerHint =
      "Apply P1-07 DDL (health/external-monitor?apply=1) then NOTIFY pgrst, 'reload schema';";
  }

  const wired = tickWired();
  const ok = durableReady && wired && (input?.smoke === false || smokeOk);

  return {
    ok,
    incidentsTableOk,
    deliveriesTableOk,
    checkRunsTableOk,
    injectionsTableOk,
    claimRpcOk,
    durableReady,
    memoryNotSot: true,
    tickWired: wired,
    appliedViaPostgres,
    appliedViaManagementApi,
    smokeOk,
    error: ok ? null : error ?? "external_monitor_not_ready",
    ownerHint: ok ? null : ownerHint,
    envPresence,
    version,
    smoke,
  };
}
