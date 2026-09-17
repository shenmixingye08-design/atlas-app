import "server-only";

import pg from "pg";

const POSTGRES_ENV_KEYS = [
  "DURABLE_SOT_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "DIRECT_URL",
] as const;

export function resolveDurableSotDatabaseUrl(): string | null {
  for (const key of POSTGRES_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export type DurableSotPool = pg.Pool;

export function createDurableSotPool(connectionString: string): DurableSotPool {
  return new pg.Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export function uniqueConstraintName(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof (error as { constraint?: unknown }).constraint === "string"
  ) {
    return (error as { constraint: string }).constraint;
  }
  return undefined;
}
