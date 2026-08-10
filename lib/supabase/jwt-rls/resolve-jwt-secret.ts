import "server-only";

import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

import type { ResolveJwtSecretResult } from "./types";

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

function readEnvSecret(): string | null {
  const candidates = [
    process.env.SUPABASE_JWT_SECRET?.trim(),
    process.env.SUPABASE_JWT_SECRET_KEY?.trim(),
    process.env.JWT_SECRET?.trim(),
  ];
  for (const value of candidates) {
    if (value && value.length >= 16) return value;
  }
  return null;
}

/**
 * Short-lived process cache for JWT secret resolution.
 * Cache is NOT SoT — authorization decisions always go through live PostgREST RLS.
 */
let cached:
  | { secret: string; source: "env" | "management_api"; expiresAtMs: number }
  | null = null;

export function clearJwtSecretCacheForTests(): void {
  cached = null;
}

async function fetchJwtSecretViaManagementApi(): Promise<{
  secret: string | null;
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
    return { secret: null, error: "management_api_credentials_missing" };
  }

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/postgrest`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      const text = await response.text();
      return {
        secret: null,
        error: `management_api_${response.status}:${text.slice(0, 160)}`,
      };
    }
    const body = (await response.json()) as { jwt_secret?: unknown };
    const secret =
      typeof body.jwt_secret === "string" ? body.jwt_secret.trim() : "";
    if (!secret || secret.length < 16) {
      return { secret: null, error: "management_api_jwt_secret_absent" };
    }
    return { secret, error: null };
  } catch (error) {
    return {
      secret: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve Supabase JWT signing secret for Clerk↔Supabase bridge.
 * Order: env → Management API postgrest config. Fail-closed when neither works.
 */
export async function resolveSupabaseJwtSecret(options?: {
  forceRefresh?: boolean;
}): Promise<ResolveJwtSecretResult> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cached &&
    cached.expiresAtMs > now &&
    cached.secret
  ) {
    return { ok: true, secret: cached.secret, source: cached.source };
  }

  const fromEnv = readEnvSecret();
  if (fromEnv) {
    cached = {
      secret: fromEnv,
      source: "env",
      expiresAtMs: now + 5 * 60_000,
    };
    return { ok: true, secret: fromEnv, source: "env" };
  }

  const fromApi = await fetchJwtSecretViaManagementApi();
  if (fromApi.secret) {
    cached = {
      secret: fromApi.secret,
      source: "management_api",
      expiresAtMs: now + 5 * 60_000,
    };
    return { ok: true, secret: fromApi.secret, source: "management_api" };
  }

  cached = null;
  return {
    ok: false,
    secret: null,
    source: "none",
    error: fromApi.error ?? "supabase_jwt_secret_not_configured",
  };
}
