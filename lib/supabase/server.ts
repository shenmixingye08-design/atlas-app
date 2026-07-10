import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerSupabaseEnv } from "./env";

import type { Database } from "./database.types";

/**
 * Server Supabase client for Server Components, Server Actions, and Route Handlers.
 */
export async function createClient() {
  const env = getServerSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; proxy/middleware refreshes sessions.
        }
      },
    },
  });
}

/** Returns a server client when env vars are present; otherwise null. */
export async function createClientIfConfigured() {
  const env = getServerSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored in Server Components — see createClient() note above.
        }
      },
    },
  });
}
