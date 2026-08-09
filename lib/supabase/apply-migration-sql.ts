import "server-only";

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type MigrationApplyResult = {
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: {
    serviceRole: boolean;
    postgresUrl: boolean;
    supabaseAccessToken: boolean;
    projectRef: string | null;
    postgresEnvKeys: string[];
  };
};

function projectRefFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Prefer shared literal env resolution (Next.js-safe) so Production apply=1
 * can use the same DATABASE_URL that work-queue health already sees.
 */
function resolvePostgresConnectionString(): {
  connectionString: string;
  presentKeys: string[];
} {
  const resolved = resolveAtlasPostgresUrl();
  return {
    connectionString: resolved.connectionString ?? "",
    presentKeys: resolved.presentKeys,
  };
}

export function getMigrationEnvPresence(): MigrationApplyResult["envPresence"] {
  const service = getSupabaseServiceRoleEnv();
  const { connectionString, presentKeys } = resolvePostgresConnectionString();
  const accessToken = Boolean(
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
      process.env.SUPABASE_MANAGEMENT_TOKEN?.trim(),
  );
  return {
    serviceRole: Boolean(service),
    postgresUrl: Boolean(connectionString),
    supabaseAccessToken: accessToken,
    projectRef:
      process.env.SUPABASE_PROJECT_REF?.trim() ||
      projectRefFromUrl(service?.url),
    postgresEnvKeys: presentKeys,
  };
}

async function tryApplyViaPostgres(sql: string): Promise<{
  applied: boolean;
  error: string | null;
}> {
  const { connectionString } = resolvePostgresConnectionString();
  if (!connectionString || !sql.trim()) {
    return { applied: false, error: null };
  }

  try {
    const pgModule = await import("pg");
    const Client = pgModule.Client ?? pgModule.default?.Client;
    if (!Client) {
      return { applied: false, error: "pg_client_unavailable" };
    }
    const client = new Client({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return { applied: true, error: null };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function tryApplyViaManagementApi(
  sql: string,
  migrationName: string,
): Promise<{
  applied: boolean;
  error: string | null;
}> {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
    process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() ||
    "";
  const ref =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(getSupabaseServiceRoleEnv()?.url) ||
    "";
  if (!token || !ref) {
    return { applied: false, error: null };
  }

  try {
    const endpoints = [
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
    ];
    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      const body = endpoint.endsWith("/migrations")
        ? { name: migrationName, query: sql }
        : { query: sql };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return { applied: true, error: null };
      }
      const text = await response.text();
      lastError = `management_api_${response.status}: ${text.slice(0, 300)}`;
    }
    return { applied: false, error: lastError };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply DDL via Postgres connection string or Supabase Management API.
 * Service role alone cannot create tables (PostgREST has no DDL).
 */
export async function applyMigrationSql(input: {
  sql: string;
  migrationName: string;
}): Promise<MigrationApplyResult> {
  const presence = getMigrationEnvPresence();
  const viaPg = await tryApplyViaPostgres(input.sql);
  if (viaPg.applied) {
    return {
      appliedViaPostgres: true,
      appliedViaManagementApi: false,
      error: null,
      envPresence: presence,
    };
  }
  const viaApi = await tryApplyViaManagementApi(
    input.sql,
    input.migrationName,
  );
  if (viaApi.applied) {
    return {
      appliedViaPostgres: false,
      appliedViaManagementApi: true,
      error: null,
      envPresence: presence,
    };
  }
  return {
    appliedViaPostgres: false,
    appliedViaManagementApi: false,
    error:
      viaApi.error ??
      viaPg.error ??
      (!presence.postgresUrl && !presence.supabaseAccessToken
        ? "no_postgres_url_or_management_token"
        : "apply_failed"),
    envPresence: presence,
  };
}
