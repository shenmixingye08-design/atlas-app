import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type NotificationStorageBackend = "supabase" | "memory_durable" | "local";

/**
 * P0-4: Production inbox SoT is Supabase rows only.
 * memory_durable is test-only (forbidden in Production).
 */
export function resolveNotificationStorageBackend(): NotificationStorageBackend {
  const forced = process.env.ATLAS_NOTIFICATION_STORAGE?.trim().toLowerCase();

  if (forced === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[notifications] P0-4: memory_durable inbox is forbidden in Production",
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

export function isNotificationDurableRequired(): boolean {
  const backend = resolveNotificationStorageBackend();
  return backend === "supabase" || backend === "memory_durable";
}

export function assertNotificationBackendReady(): void {
  const backend = resolveNotificationStorageBackend();
  if (backend === "memory_durable") return;
  if (backend !== "supabase") return;
  if (getSupabaseServiceRoleEnv()) return;
  throw new Error(
    "[notifications] P0-4: Production durable inbox requires Supabase service role",
  );
}
