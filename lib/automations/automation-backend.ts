import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type AutomationStorageBackend = "supabase" | "memory_durable" | "local";

/**
 * P0-6: Production Automation SoT is Durable DB rows only.
 * memory_durable is test-only (forbidden in Production).
 */
export function resolveAutomationStorageBackend(): AutomationStorageBackend {
  const forced = process.env.ATLAS_AUTOMATION_STORAGE?.trim().toLowerCase();

  if (forced === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[automations] P0-6: memory_durable automation store is forbidden in Production",
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

export function isAutomationDurableRequired(): boolean {
  const backend = resolveAutomationStorageBackend();
  return backend === "supabase" || backend === "memory_durable";
}

export function assertAutomationBackendReady(): void {
  const backend = resolveAutomationStorageBackend();
  if (backend === "memory_durable") return;
  if (backend !== "supabase") return;
  if (getSupabaseServiceRoleEnv()) return;
  throw new Error(
    "[automations] P0-6: Production durable automation engine requires Supabase service role — Map fallback disabled",
  );
}
