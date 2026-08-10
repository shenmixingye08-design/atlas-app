import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseEnv } from "@/lib/supabase/env";

import { mintClerkSupabaseJwt } from "./mint-clerk-jwt";
import { resolveSupabaseJwtSecret } from "./resolve-jwt-secret";

export type ClerkJwtSupabaseClientResult =
  | {
      ok: true;
      client: SupabaseClient;
      userId: string;
      secretSource: "env" | "management_api" | "db_bridge";
    }
  | { ok: false; client: null; error: string };

/**
 * Server-only Supabase client scoped by a Clerk-bridged JWT.
 * PostgREST sees role=authenticated and auth.jwt()->>'sub' = userId.
 * Does NOT replace application ownership checks (P0-03).
 */
export async function createClerkJwtSupabaseClient(
  userId: string,
  options?: { expiresInSec?: number },
): Promise<ClerkJwtSupabaseClientResult> {
  const trimmed = userId?.trim();
  if (!trimmed) {
    return { ok: false, client: null, error: "clerk_user_id_required" };
  }

  const env = getServerSupabaseEnv();
  if (!env) {
    return { ok: false, client: null, error: "supabase_not_configured" };
  }

  const secret = await resolveSupabaseJwtSecret();
  if (!secret.ok) {
    return {
      ok: false,
      client: null,
      error: secret.error || "supabase_jwt_secret_not_configured",
    };
  }

  let jwt: string;
  try {
    jwt = mintClerkSupabaseJwt({
      userId: trimmed,
      secret: secret.secret,
      expiresInSec: options?.expiresInSec,
    });
  } catch (error) {
    return {
      ok: false,
      client: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

  return {
    ok: true,
    client,
    userId: trimmed,
    secretSource: secret.source,
  };
}

/** Anon client with NO user JWT — must be denied by RLS on JWT-linked tables. */
export function createAnonSupabaseClientForJwtProbe(): SupabaseClient | null {
  const env = getServerSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
