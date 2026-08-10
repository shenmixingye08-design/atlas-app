import "server-only";

import { applyMigrationSql } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  ATLAS_JWT_RLS_MIGRATION_NAME,
  ATLAS_JWT_RLS_MIGRATION_SQL,
} from "./migration-sql";
import type { JwtRlsSubjectRow } from "./types";

export async function applyJwtRlsMigration(): Promise<{
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
}> {
  return applyMigrationSql({
    sql: ATLAS_JWT_RLS_MIGRATION_SQL,
    migrationName: ATLAS_JWT_RLS_MIGRATION_NAME,
  });
}

export function isTransientJwtClockError(message: string): boolean {
  return /JWT|clock|iat|exp|token is expired/i.test(message);
}

export async function upsertJwtRlsSubject(
  row: JwtRlsSubjectRow,
): Promise<{ ok: boolean; error: string | null }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { error } = await client.from("atlas_jwt_rls_subjects").upsert(
      {
        id: row.id,
        user_id: row.user_id,
        correlation_id: row.correlation_id,
        label: row.label,
        metadata: row.metadata ?? {},
      } as never,
      { onConflict: "id" },
    );
    if (!error) return { ok: true, error: null };
    if (!isTransientJwtClockError(error.message) || attempt === 4) {
      return { ok: false, error: error.message };
    }
    await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  return { ok: false, error: "upsert_failed" };
}

export async function deleteJwtRlsSubjectsByIds(
  ids: string[],
): Promise<{ ok: boolean; error: string | null }> {
  if (ids.length === 0) return { ok: true, error: null };
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }
  const { error } = await client
    .from("atlas_jwt_rls_subjects")
    .delete()
    .in("id", ids);
  return { ok: !error, error: error?.message ?? null };
}

export async function listJwtRlsSubjectsByCorrelationId(
  correlationId: string,
): Promise<JwtRlsSubjectRow[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  const { data, error } = await client
    .from("atlas_jwt_rls_subjects")
    .select("id,user_id,correlation_id,label,metadata,created_at")
    .eq("correlation_id", correlationId)
    .limit(50);
  if (error || !data) return [];
  return data as JwtRlsSubjectRow[];
}
