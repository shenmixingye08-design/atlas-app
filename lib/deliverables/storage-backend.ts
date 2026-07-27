import "server-only";

import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type DeliverableStorageBackend = "supabase" | "local";

/**
 * Resolve where deliverable binaries are persisted.
 * - Vercel Production / Preview: always Supabase Storage (required).
 * - Local development / Vitest: local memory+disk unless forced to supabase.
 */
export function resolveDeliverableStorageBackend(): DeliverableStorageBackend {
  const forced = process.env.ATLAS_DELIVERABLE_STORAGE?.trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();

  if (vercelEnv === "production" || vercelEnv === "preview") {
    return "supabase";
  }

  if (forced === "supabase") return "supabase";
  if (forced === "local") return "local";

  return "local";
}

export function isDeliverableStorageRequired(): boolean {
  return resolveDeliverableStorageBackend() === "supabase";
}

export function allowDeliverableDiskFallback(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return true;
  }
  return resolveDeliverableStorageBackend() === "local";
}

export function assertDeliverableBackendReady(
  backend: DeliverableStorageBackend = resolveDeliverableStorageBackend(),
): void {
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
