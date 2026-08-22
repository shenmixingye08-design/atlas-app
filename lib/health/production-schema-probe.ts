/**
 * Production schema probe for objects that have been missing from PostgREST
 * cache (PGRST205). Exercises SELECT / INSERT / UPDATE / UPSERT / RPC.
 * Probe rows use an internal sentinel id and are deleted afterwards.
 */

import "server-only";

import { randomUUID } from "crypto";

import { applyMigrationSql, getMigrationEnvPresence } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL } from "./production-schema-migration-sql";

export const PRODUCTION_SCHEMA_PROBE_USER_ID = "__atlas_prod_schema_probe__";

export type ProductionSchemaObjectResult = {
  name: string;
  selectOk: boolean;
  insertOk: boolean;
  updateOk: boolean;
  upsertOk: boolean;
  rpcOk: boolean | null;
  error: string | null;
};

export type ProductionSchemaProbe = {
  ok: boolean;
  deliverableFiles: ProductionSchemaObjectResult;
  automationJobs: ProductionSchemaObjectResult;
  xAutopostSettings: ProductionSchemaObjectResult;
  claimXPostJobs: ProductionSchemaObjectResult;
  schemaErrors: string[];
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

function emptyObject(name: string, error: string | null): ProductionSchemaObjectResult {
  return {
    name,
    selectOk: false,
    insertOk: false,
    updateOk: false,
    upsertOk: false,
    rpcOk: name === "atlas_claim_x_post_jobs" ? false : null,
    error,
  };
}

type ServiceClient = NonNullable<
  ReturnType<typeof createServiceRoleClientIfConfigured>
>;

async function probeDeliverableFiles(
  client: ServiceClient,
): Promise<ProductionSchemaObjectResult> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 60_000).toISOString();
  const result = emptyObject("atlas_deliverable_files", null);

  const { error: selectError } = await client
    .from("atlas_deliverable_files")
    .select("id")
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID)
    .limit(1);
  if (selectError) {
    result.error = selectError.message;
    return result;
  }
  result.selectOk = true;

  const { error: insertError } = await client.from("atlas_deliverable_files").insert({
    id,
    user_id: PRODUCTION_SCHEMA_PROBE_USER_ID,
    file_name: "schema-probe.txt",
    format: "txt",
    mime_type: "text/plain",
    is_placeholder: true,
    source_content: "schema-probe",
    base_file_name: "schema-probe",
    generated_at: now,
    expires_at: expires,
  });
  if (insertError) {
    result.error = insertError.message;
    return result;
  }
  result.insertOk = true;

  const { error: updateError } = await client
    .from("atlas_deliverable_files")
    .update({ file_name: "schema-probe-updated.txt" })
    .eq("id", id)
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);
  if (updateError) {
    result.error = updateError.message;
  } else {
    result.updateOk = true;
  }

  const { error: upsertError } = await client.from("atlas_deliverable_files").upsert(
    {
      id,
      user_id: PRODUCTION_SCHEMA_PROBE_USER_ID,
      file_name: "schema-probe-upsert.txt",
      format: "txt",
      mime_type: "text/plain",
      is_placeholder: true,
      source_content: "schema-probe",
      base_file_name: "schema-probe",
      generated_at: now,
      expires_at: expires,
    },
    { onConflict: "id" },
  );
  if (upsertError) {
    result.error = result.error ?? upsertError.message;
  } else {
    result.upsertOk = true;
  }

  await client
    .from("atlas_deliverable_files")
    .delete()
    .eq("id", id)
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);

  return result;
}

async function probeAutomationJobs(
  client: ServiceClient,
): Promise<ProductionSchemaObjectResult> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = emptyObject("atlas_automation_jobs", null);

  const { error: selectError } = await client
    .from("atlas_automation_jobs")
    .select("id")
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID)
    .limit(1);
  if (selectError) {
    result.error = selectError.message;
    return result;
  }
  result.selectOk = true;

  const { error: insertError } = await client.from("atlas_automation_jobs").insert({
    id,
    user_id: PRODUCTION_SCHEMA_PROBE_USER_ID,
    automation_id: "schema_probe",
    job_type: "schema_probe",
    status: "queued",
    idempotency_key: `schema_probe_${id}`,
    queued_at: now,
  });
  if (insertError) {
    result.error = insertError.message;
    return result;
  }
  result.insertOk = true;

  const { error: updateError } = await client
    .from("atlas_automation_jobs")
    .update({ status: "queued", last_error_code: null })
    .eq("id", id)
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);
  if (updateError) {
    result.error = updateError.message;
  } else {
    result.updateOk = true;
  }

  const { error: upsertError } = await client.from("atlas_automation_jobs").upsert(
    {
      id,
      user_id: PRODUCTION_SCHEMA_PROBE_USER_ID,
      automation_id: "schema_probe",
      job_type: "schema_probe",
      status: "queued",
      idempotency_key: `schema_probe_${id}`,
      queued_at: now,
    },
    { onConflict: "id" },
  );
  if (upsertError) {
    result.error = result.error ?? upsertError.message;
  } else {
    result.upsertOk = true;
  }

  await client
    .from("atlas_automation_jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);

  return result;
}

async function probeXAutopostSettings(
  client: ServiceClient,
): Promise<ProductionSchemaObjectResult> {
  const result = emptyObject("atlas_x_autopost_settings", null);

  const { error: selectError } = await client
    .from("atlas_x_autopost_settings")
    .select("user_id")
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID)
    .maybeSingle();
  if (selectError) {
    result.error = selectError.message;
    return result;
  }
  result.selectOk = true;

  const row = {
    user_id: PRODUCTION_SCHEMA_PROBE_USER_ID,
    enabled: false,
    mode: "approval",
    purpose: "schema-probe",
  };

  const { error: insertError } = await client
    .from("atlas_x_autopost_settings")
    .insert(row);
  if (insertError && insertError.code !== "23505") {
    result.error = insertError.message;
    return result;
  }
  result.insertOk = true;

  const { error: updateError } = await client
    .from("atlas_x_autopost_settings")
    .update({ purpose: "schema-probe-updated" })
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);
  if (updateError) {
    result.error = updateError.message;
  } else {
    result.updateOk = true;
  }

  const { error: upsertError } = await client
    .from("atlas_x_autopost_settings")
    .upsert({ ...row, purpose: "schema-probe-upsert" }, { onConflict: "user_id" });
  if (upsertError) {
    result.error = result.error ?? upsertError.message;
  } else {
    result.upsertOk = true;
  }

  await client
    .from("atlas_x_autopost_settings")
    .delete()
    .eq("user_id", PRODUCTION_SCHEMA_PROBE_USER_ID);

  return result;
}

async function probeClaimXPostJobs(
  client: ServiceClient,
): Promise<ProductionSchemaObjectResult> {
  const result = emptyObject("atlas_claim_x_post_jobs", null);

  const { error: selectError } = await client
    .from("atlas_x_post_jobs")
    .select("x_post_job_id")
    .eq("owner_id", PRODUCTION_SCHEMA_PROBE_USER_ID)
    .limit(1);
  if (selectError) {
    result.error = selectError.message;
    result.rpcOk = false;
    return result;
  }
  result.selectOk = true;

  // p_now at epoch: due predicate cannot match real Production jobs.
  const { error: rpcError } = await client.rpc("atlas_claim_x_post_jobs", {
    p_worker_id: "schema_probe_never_post",
    p_limit: 1,
    p_lease_ms: 1000,
    p_now: "1970-01-01T00:00:00Z",
  });
  if (rpcError) {
    result.error = rpcError.message;
    result.rpcOk = false;
    return result;
  }
  result.rpcOk = true;
  result.insertOk = true;
  result.updateOk = true;
  result.upsertOk = true;
  return result;
}

function objectOk(row: ProductionSchemaObjectResult): boolean {
  if (row.rpcOk === false) return false;
  if (row.rpcOk === true) return row.selectOk && !row.error;
  return row.selectOk && row.insertOk && row.updateOk && row.upsertOk && !row.error;
}

export async function probeProductionAutomationSchema(options?: {
  apply?: boolean;
}): Promise<ProductionSchemaProbe> {
  const version = getHealthVersionPayload();
  const envPresence = getMigrationEnvPresence();
  const fail = (error: string): ProductionSchemaProbe => ({
    ok: false,
    deliverableFiles: emptyObject("atlas_deliverable_files", error),
    automationJobs: emptyObject("atlas_automation_jobs", error),
    xAutopostSettings: emptyObject("atlas_x_autopost_settings", error),
    claimXPostJobs: emptyObject("atlas_claim_x_post_jobs", error),
    schemaErrors: [error],
    appliedViaPostgres: false,
    appliedViaManagementApi: false,
    error,
    envPresence,
    version,
  });

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return fail("supabase_service_role_not_configured");
  }

  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  if (options?.apply) {
    const applied = await applyMigrationSql({
      sql: ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL,
      migrationName: "20260822_prod_automation_schema_ensure",
    });
    appliedViaPostgres = applied.appliedViaPostgres;
    appliedViaManagementApi = applied.appliedViaManagementApi;
  }

  const [deliverableFiles, automationJobs, xAutopostSettings, claimXPostJobs] =
    await Promise.all([
      probeDeliverableFiles(client),
      probeAutomationJobs(client),
      probeXAutopostSettings(client),
      probeClaimXPostJobs(client),
    ]);

  const objects = [
    deliverableFiles,
    automationJobs,
    xAutopostSettings,
    claimXPostJobs,
  ];
  const schemaErrors = objects
    .filter((row) => !objectOk(row))
    .map((row) => `${row.name}:${row.error ?? "probe_failed"}`);

  const ok = objects.every(objectOk);
  return {
    ok,
    deliverableFiles,
    automationJobs,
    xAutopostSettings,
    claimXPostJobs,
    schemaErrors,
    appliedViaPostgres,
    appliedViaManagementApi,
    error: ok ? null : schemaErrors.join("; "),
    envPresence,
    version,
  };
}

/** Fast read-only check for tick summary — no mutating apply. */
export async function listTickSchemaErrors(): Promise<string[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return ["supabase_service_role_not_configured"];
  const checks: Array<{
    name: string;
    run: () => PromiseLike<{ error?: { message?: string } | null }>;
  }> = [
    {
      name: "atlas_deliverable_files",
      run: () =>
        client.from("atlas_deliverable_files").select("id").limit(1),
    },
    {
      name: "atlas_automation_jobs",
      run: () => client.from("atlas_automation_jobs").select("id").limit(1),
    },
    {
      name: "atlas_x_autopost_settings",
      run: () =>
        client.from("atlas_x_autopost_settings").select("user_id").limit(1),
    },
    {
      name: "atlas_claim_x_post_jobs",
      run: () =>
        client.rpc("atlas_claim_x_post_jobs", {
          p_worker_id: "tick_schema_probe",
          p_limit: 1,
          p_lease_ms: 1000,
          p_now: "1970-01-01T00:00:00Z",
        }),
    },
    {
      name: "atlas_user_state",
      run: () =>
        client.from("atlas_user_state").select("user_id").limit(1),
    },
    {
      name: "atlas_user_notifications",
      run: () =>
        client
          .from("atlas_user_notifications")
          .select("notification_id")
          .limit(1),
    },
  ];
  const errors: string[] = [];
  for (const check of checks) {
    try {
      const { error } = await check.run();
      if (error?.message) {
        errors.push(`${check.name}:${error.message.slice(0, 160)}`);
      }
    } catch (error) {
      errors.push(
        `${check.name}:${error instanceof Error ? error.message.slice(0, 160) : "probe_failed"}`,
      );
    }
  }
  return errors;
}
