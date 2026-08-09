/**
 * Shared Postgres URL resolution for Production DB SoT paths.
 * Keep work-queue and migration apply on the same env key set.
 */

export const ATLAS_POSTGRES_URL_ENV_KEYS = [
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

/** Historical narrow set used by work-queue before P1 tick fix. */
export const ATLAS_POSTGRES_URL_LEGACY_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "DIRECT_URL",
] as const;

export function resolveAtlasPostgresUrl(): {
  connectionString: string | null;
  presentKeys: string[];
  legacyPresent: boolean;
  extendedOnlyPresent: boolean;
} {
  const presentKeys = ATLAS_POSTGRES_URL_ENV_KEYS.filter((key) =>
    Boolean(process.env[key]?.trim()),
  );
  const legacyPresent = ATLAS_POSTGRES_URL_LEGACY_KEYS.some((key) =>
    Boolean(process.env[key]?.trim()),
  );
  const extendedOnlyPresent =
    !legacyPresent &&
    presentKeys.some(
      (key) =>
        !(ATLAS_POSTGRES_URL_LEGACY_KEYS as readonly string[]).includes(key),
    );

  let connectionString: string | null = null;
  for (const key of ATLAS_POSTGRES_URL_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      connectionString = value;
      break;
    }
  }

  return {
    connectionString,
    presentKeys: [...presentKeys],
    legacyPresent,
    extendedOnlyPresent,
  };
}

export function isAtlasPostgresUrlConfigured(): boolean {
  return Boolean(resolveAtlasPostgresUrl().connectionString);
}
