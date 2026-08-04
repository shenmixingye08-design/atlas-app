import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type DeliverableStorageBackend = "supabase" | "memory_durable" | "local";

/**
 * Resolve where deliverable binaries are persisted.
 * - Vercel Production / Preview / NODE_ENV=production: Supabase only.
 * - ATLAS_DELIVERABLE_STORAGE=memory_durable: test durable SoT (never Production).
 * - Local development / Vitest default: local (non-Production only).
 */
export function resolveDeliverableStorageBackend(): DeliverableStorageBackend {
  const forced = process.env.ATLAS_DELIVERABLE_STORAGE?.trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();

  if (forced === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[deliverables] P0-3: memory_durable storage is forbidden in Production",
      );
    }
    return "memory_durable";
  }

  if (
    vercelEnv === "production" ||
    vercelEnv === "preview" ||
    isAtlasProduction()
  ) {
    return "supabase";
  }

  if (forced === "supabase") return "supabase";
  if (forced === "local") return "local";

  return "local";
}

export function isDeliverableStorageRequired(): boolean {
  const backend = resolveDeliverableStorageBackend();
  return backend === "supabase" || backend === "memory_durable";
}

/** Disk / process-only fallback — never on Vercel or Production. */
export function allowDeliverableDiskFallback(): boolean {
  if (process.env.ATLAS_FORCE_EPHEMERAL_FS === "1") return false;
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (isAtlasProduction()) return false;
  if (resolveDeliverableStorageBackend() === "memory_durable") return false;
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return true;
  }
  return resolveDeliverableStorageBackend() === "local";
}

export function assertDeliverableBackendReady(
  backend: DeliverableStorageBackend = resolveDeliverableStorageBackend(),
): void {
  if (backend === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[deliverables] P0-3: memory_durable forbidden in Production",
      );
    }
    return;
  }
  if (backend !== "supabase") return;
  if (getSupabaseServiceRoleEnv()) return;

  const vercelEnv = process.env.VERCEL_ENV?.trim() || "local";
  throw new Error(
    `Deliverable storage requires Supabase on ${vercelEnv}. ` +
      "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

export function getDeliverableStorageBackendLabel(): DeliverableStorageBackend {
  return resolveDeliverableStorageBackend();
}
