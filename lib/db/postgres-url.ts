/**
 * Shared Postgres URL resolution for Production DB SoT paths.
 * Keep work-queue and migration apply on the same env key set.
 *
 * IMPORTANT (Next.js): use literal `process.env.NAME` reads.
 * Dynamic `process.env[key]` is often stripped/undefined in the server bundle,
 * which made Production report postgresUrlConfigured=false even after Owner
 * set DATABASE_URL on Vercel.
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

type EnvEntry = { key: (typeof ATLAS_POSTGRES_URL_ENV_KEYS)[number]; value: string };

/**
 * Literal env reads so Next.js/Vercel includes these keys in the server runtime env.
 */
function readPostgresUrlEntries(): EnvEntry[] {
  const raw: Array<[EnvEntry["key"], string | undefined]> = [
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
    ["SUPABASE_DB_URL", process.env.SUPABASE_DB_URL],
    ["SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL],
    ["SUPABASE_POSTGRES_URL", process.env.SUPABASE_POSTGRES_URL],
    ["SUPABASE_POSTGRES_URL_NON_POOLING", process.env.SUPABASE_POSTGRES_URL_NON_POOLING],
  ];
  const out: EnvEntry[] = [];
  for (const [key, value] of raw) {
    const trimmed = value?.trim();
    if (trimmed) out.push({ key, value: trimmed });
  }
  return out;
}

function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.trim()).hostname;
    // xxx.supabase.co
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function constructFromPasswordAndRef(): string | null {
  // Literal reads — same fallback pattern as migration apply.
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.POSTGRES_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASSWORD?.trim() ||
    process.env.DATABASE_PASSWORD?.trim() ||
    "";
  const ref =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    projectRefFromSupabaseUrl(process.env.SUPABASE_URL) ||
    "";
  if (!password || !ref) return null;
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;
}

export function resolveAtlasPostgresUrl(): {
  connectionString: string | null;
  presentKeys: string[];
  legacyPresent: boolean;
  extendedOnlyPresent: boolean;
} {
  const entries = readPostgresUrlEntries();
  const presentKeys = entries.map((e) => e.key);
  const legacyPresent = presentKeys.some((key) =>
    (ATLAS_POSTGRES_URL_LEGACY_KEYS as readonly string[]).includes(key),
  );
  const extendedOnlyPresent =
    !legacyPresent &&
    presentKeys.some(
      (key) =>
        !(ATLAS_POSTGRES_URL_LEGACY_KEYS as readonly string[]).includes(key),
    );

  let connectionString: string | null = entries[0]?.value ?? null;
  if (!connectionString) {
    connectionString = constructFromPasswordAndRef();
  }

  return {
    connectionString,
    presentKeys: connectionString && presentKeys.length === 0
      ? ["constructed_from_password_and_ref"]
      : [...presentKeys],
    legacyPresent,
    extendedOnlyPresent,
  };
}

export function isAtlasPostgresUrlConfigured(): boolean {
  return Boolean(resolveAtlasPostgresUrl().connectionString);
}
