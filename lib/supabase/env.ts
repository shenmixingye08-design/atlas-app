/**
 * Supabase environment configuration.
 *
 * Server code may use `SUPABASE_*`; browser code requires `NEXT_PUBLIC_*`.
 * The anon key is safe to expose to the client when RLS is enabled.
 */

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export type SupabaseServiceEnv = {
  url: string;
  serviceRoleKey: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** Server-side Supabase credentials (`SUPABASE_*` with public fallbacks). */
export function getServerSupabaseEnv(): SupabaseEnv | null {
  const url =
    readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? null;
  const anonKey =
    readEnv("SUPABASE_ANON_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    null;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Service-role credentials for server-only durable writes (bypasses RLS). */
export function getSupabaseServiceRoleEnv(): SupabaseServiceEnv | null {
  const url =
    readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? null;
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? null;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/** Browser Supabase credentials (`NEXT_PUBLIC_*` only). */
export function getBrowserSupabaseEnv(): SupabaseEnv | null {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? readEnv("SUPABASE_URL");
  const anonKey =
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? readEnv("SUPABASE_ANON_KEY");

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(scope: "server" | "browser" = "browser"): boolean {
  return scope === "server"
    ? getServerSupabaseEnv() !== null
    : getBrowserSupabaseEnv() !== null;
}

/** Project persistence backend selector. */
export type ProjectStorageBackend = "localStorage" | "supabase";

/**
 * Resolve the active project repository from env or explicit options.
 *
 * - `NEXT_PUBLIC_ATLAS_PROJECT_STORAGE=localStorage` → localStorage only
 * - `supabase` → Supabase primary (browser anon is RLS-denied; treat as cache unless service role server path writes)
 * - unset → Supabase when configured, otherwise localStorage (dev cache/fallback)
 *
 * Production: localStorage is warned — it does not survive multi-instance / redeploy as shared truth.
 */
export function resolveProjectStorageBackend(): ProjectStorageBackend {
  const value = readEnv("NEXT_PUBLIC_ATLAS_PROJECT_STORAGE");
  if (value === "localStorage") {
    if (
      process.env.VERCEL_ENV === "production" ||
      process.env.NODE_ENV === "production"
    ) {
      console.error(
        "[projects] Production uses localStorage project backend — data is not shared durable storage. " +
          "Prefer service-role Commander upserts + apply projects migrations; do not treat browser cache as saved.",
      );
    }
    return "localStorage";
  }
  if (value === "supabase") return "supabase";
  return isSupabaseConfigured("browser") ? "supabase" : "localStorage";
}
