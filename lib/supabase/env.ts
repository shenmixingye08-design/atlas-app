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

/** Project persistence backend selector (defaults to localStorage). */
export type ProjectStorageBackend = "localStorage" | "supabase";

export function resolveProjectStorageBackend(): ProjectStorageBackend {
  const value = readEnv("NEXT_PUBLIC_ATLAS_PROJECT_STORAGE");
  return value === "supabase" ? "supabase" : "localStorage";
}
