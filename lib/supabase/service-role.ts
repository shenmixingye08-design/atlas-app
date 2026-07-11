import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleEnv } from "./env";

import type { Database } from "./database.types";

/**
 * Server-only Supabase client with the service role key (bypasses RLS).
 * Never import this into Client Components.
 */
export function createServiceRoleClientIfConfigured() {
  const env = getSupabaseServiceRoleEnv();
  if (!env) return null;

  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
