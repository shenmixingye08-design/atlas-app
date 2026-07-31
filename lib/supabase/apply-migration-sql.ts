import "server-only";

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

const POSTGRES_ENV_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_POSTGRES_URL",
  "SUPABASE_POSTGRES_URL_NON_POOLING",
] as const;

const DB_PASSWORD_ENV_KEYS = [
  "SUPABASE_DB_PASSWORD",
  "POSTGRES_PASSWORD",
  "SUPABASE_DATABASE_PASSWORD",
  "DATABASE_PASSWORD",
] as const;

function resolvePostgresConnectionString(): {
  connectionString: string;
  presentKeys: string[];
} {
  const presentKeys = [
    ...POSTGRES_ENV_KEYS.filter((key) => Boolean(process.env[key]?.trim())),
    ...DB_PASSWORD_ENV_KEYS.filter((key) => Boolean(process.env[key]?.trim())),
  ];
  for (const key of POSTGRES_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return { connectionString: value, presentKeys };
  }

  // Construct from project ref + DB password when full URL is absent.
  const password = DB_PASSWORD_ENV_KEYS.map((k) => process.env[k]?.trim()).find(
    Boolean,
  );
  const ref =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(getSupabaseServiceRoleEnv()?.url);
  if (password && ref) {
    const encoded = encodeURIComponent(password);
    return {
      connectionString: `postgresql://postgres.${ref}:${encoded}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
      presentKeys,
    };
  }

  return { connectionString: "", presentKeys };
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
