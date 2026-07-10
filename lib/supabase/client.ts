import { createBrowserClient } from "@supabase/ssr";

import { getBrowserSupabaseEnv } from "./env";

import type { Database } from "./database.types";

/**
 * Browser Supabase client for Client Components.
 * Uses a singleton via `@supabase/ssr` — safe to call repeatedly.
 */
export function createClient() {
  const env = getBrowserSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) in .env.local.",
    );
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}

/**
 * Returns a browser client when env vars are present; otherwise null.
 * Used by repositories that should degrade gracefully before configuration.
 */
export function createClientIfConfigured() {
  const env = getBrowserSupabaseEnv();
  if (!env) return null;
  return createBrowserClient<Database>(env.url, env.anonKey);
}
