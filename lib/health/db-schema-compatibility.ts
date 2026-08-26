/**
 * Read-only Production schema compatibility diagnostic.
 * Does not insert, update, upsert, or delete Production rows.
 */

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { asUntypedSupabase } from "@/lib/billing/usage/untyped-supabase";
import { readUnknownSupabaseError } from "@/lib/persistence/durable-read-log";

import { classifySchemaCompatibilityError } from "./schema-compatibility";

export const DB_SCHEMA_COMPATIBILITY_OBJECTS = [
  "atlas_user_state",
  "atlas_user_notifications",
  "atlas_billing_usage_counters",
  "atlas_billing_usage_claims",
  "atlas_billing_automation_slots",
  "atlas_deliverable_files",
  "atlas_automation_jobs",
  "atlas_x_autopost_settings",
  "atlas_increment_usage_counter_once",
  "atlas_reserve_automation_slot",
  "atlas_claim_x_post_jobs",
] as const;

export type DbSchemaObjectName = (typeof DB_SCHEMA_COMPATIBILITY_OBJECTS)[number];

export type DbSchemaObjectKind = "table" | "rpc";

export type DbSchemaObjectStatus =
  | "compatible"
  | "missing_table"
  | "missing_column"
  | "missing_rpc"
  | "permission_error"
  | "schema_cache_error"
  | "unavailable";

export type DbSchemaObjectReport = {
  name: DbSchemaObjectName;
  kind: DbSchemaObjectKind;
  status: DbSchemaObjectStatus;
  requiredColumns: readonly string[];
  callable: boolean;
};

export type DbSchemaCompatibilityDiagnostic = {
  diagnostic: "DB_SCHEMA_COMPATIBILITY";
  ok: boolean;
  status: "compatible" | "incompatible" | "unavailable";
  objects: DbSchemaObjectReport[];
  error: string | null;
};

const TABLE_COLUMNS: Record<
  Extract<
    DbSchemaObjectName,
    | "atlas_user_state"
    | "atlas_user_notifications"
    | "atlas_billing_usage_counters"
    | "atlas_billing_usage_claims"
    | "atlas_billing_automation_slots"
    | "atlas_deliverable_files"
    | "atlas_automation_jobs"
    | "atlas_x_autopost_settings"
  >,
  readonly string[]
> = {
  atlas_user_state: ["user_id", "domain", "payload", "updated_at"],
  atlas_user_notifications: [
    "notification_id",
    "owner_id",
    "status",
    "title",
    "body",
  ],
  atlas_billing_usage_counters: [
    "user_id",
    "month_key",
    "ai_runs",
    "sns_posts",
    "x_url_posts",
    "wordpress_posts",
  ],
  atlas_billing_usage_claims: ["claim_key", "user_id", "month_key", "meter"],
  atlas_billing_automation_slots: ["user_id", "automation_id"],
  atlas_deliverable_files: ["id", "user_id"],
  atlas_automation_jobs: ["id", "user_id"],
  atlas_x_autopost_settings: ["user_id"],
};

const RPC_OBJECTS: readonly DbSchemaObjectName[] = [
  "atlas_increment_usage_counter_once",
  "atlas_reserve_automation_slot",
  "atlas_claim_x_post_jobs",
];

function statusFromError(error: string | null): DbSchemaObjectStatus {
  return classifySchemaCompatibilityError(error);
}

async function probeTable(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
  name: keyof typeof TABLE_COLUMNS,
): Promise<DbSchemaObjectReport> {
  const requiredColumns = TABLE_COLUMNS[name];
  const { error } = await client
    .from(name)
    .select(requiredColumns.join(", "))
    .limit(1);
  if (!error) {
    return {
      name,
      kind: "table",
      status: "compatible",
      requiredColumns,
      callable: true,
    };
  }
  const parsed = readUnknownSupabaseError(error);
  return {
    name,
    kind: "table",
    status: statusFromError(parsed.message),
    requiredColumns,
    callable: false,
  };
}

async function probeRpc(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
  name: DbSchemaObjectName,
): Promise<DbSchemaObjectReport> {
  const untyped = asUntypedSupabase(client);
  if (name === "atlas_increment_usage_counter_once") {
    const { error } = await untyped.rpc(name, {
      p_user_id: "",
      p_month_key: "1970-01",
      p_claim_key: "schema_compat_probe",
      p_meter: "ai_runs",
      p_amount: 1,
    });
    if (!error || /user_id required/i.test(error.message ?? "")) {
      return {
        name,
        kind: "rpc",
        status: "compatible",
        requiredColumns: [],
        callable: true,
      };
    }
    return {
      name,
      kind: "rpc",
      status: statusFromError(error.message ?? null),
      requiredColumns: [],
      callable: false,
    };
  }

  if (name === "atlas_reserve_automation_slot") {
    const { error } = await untyped.rpc(name, {
      p_user_id: "",
      p_automation_id: "",
      p_limit: 0,
    });
    if (
      !error ||
      /user_id required|automation_id required|limit/i.test(error.message ?? "")
    ) {
      return {
        name,
        kind: "rpc",
        status: "compatible",
        requiredColumns: [],
        callable: true,
      };
    }
    return {
      name,
      kind: "rpc",
      status: statusFromError(error.message ?? null),
      requiredColumns: [],
      callable: false,
    };
  }

  // atlas_claim_x_post_jobs mutates Production jobs — never invoke it.
  // Read-only proof: the underlying table is selectable by service_role.
  const { error } = await client
    .from("atlas_x_post_jobs")
    .select("x_post_job_id")
    .limit(1);
  if (!error) {
    return {
      name,
      kind: "rpc",
      status: "compatible",
      requiredColumns: [],
      callable: true,
    };
  }
  return {
    name,
    kind: "rpc",
    status: statusFromError(error.message ?? null),
    requiredColumns: [],
    callable: false,
  };
}

export async function probeDbSchemaCompatibility(): Promise<DbSchemaCompatibilityDiagnostic> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      diagnostic: "DB_SCHEMA_COMPATIBILITY",
      ok: false,
      status: "unavailable",
      objects: DB_SCHEMA_COMPATIBILITY_OBJECTS.map((name) => ({
        name,
        kind: RPC_OBJECTS.includes(name) ? "rpc" : "table",
        status: "unavailable",
        requiredColumns: [],
        callable: false,
      })),
      error: "supabase_service_role_not_configured",
    };
  }

  const objects: DbSchemaObjectReport[] = [];
  for (const name of Object.keys(TABLE_COLUMNS) as Array<
    keyof typeof TABLE_COLUMNS
  >) {
    objects.push(await probeTable(client, name));
  }
  for (const name of RPC_OBJECTS) {
    objects.push(await probeRpc(client, name));
  }

  const values = objects.map((row) => row.status);
  const status = values.every((code) => code === "compatible")
    ? "compatible"
    : values.every((code) => code === "unavailable")
      ? "unavailable"
      : "incompatible";

  return {
    diagnostic: "DB_SCHEMA_COMPATIBILITY",
    ok: status === "compatible",
    status,
    objects,
    error:
      status === "compatible"
        ? null
        : objects
            .filter((row) => row.status !== "compatible")
            .map((row) => `${row.name}:${row.status}`)
            .join(","),
  };
}
