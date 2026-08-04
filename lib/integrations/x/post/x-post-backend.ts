import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type XPostStorageBackend = "supabase" | "memory_durable" | "local";

/**
 * P0-5: Production X draft/schedule SoT is Supabase rows only.
 * memory_durable is test-only (forbidden in Production).
 */
export function resolveXPostStorageBackend(): XPostStorageBackend {
  const forced = process.env.ATLAS_X_POST_STORAGE?.trim().toLowerCase();

  if (forced === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[x-post] P0-5: memory_durable schedule/draft store is forbidden in Production",
      );
    }
    return "memory_durable";
  }

  if (isAtlasProduction() || process.env.VERCEL_ENV === "production") {
    return "supabase";
  }

  if (forced === "supabase") return "supabase";
  if (forced === "local") return "local";

  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return forced === "supabase" ? "supabase" : "memory_durable";
  }

  return "local";
}

export function isXPostDurableRequired(): boolean {
  const backend = resolveXPostStorageBackend();
  return backend === "supabase" || backend === "memory_durable";
}

export function assertXPostBackendReady(): void {
  const backend = resolveXPostStorageBackend();
  if (backend === "memory_durable") return;
  if (backend !== "supabase") return;
  if (getSupabaseServiceRoleEnv()) return;
  throw new Error(
    "[x-post] P0-5: Production durable X posts require Supabase service role — Map fallback disabled",
  );
}

export const X_POST_LEASE_MS = 60_000;
export const X_POST_MAX_ATTEMPTS_DEFAULT = 5;
