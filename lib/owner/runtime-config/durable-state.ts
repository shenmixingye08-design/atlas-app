import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { ATLAS_USER_STATE_TABLE } from "@/lib/persistence/supabase-user-state";
import { withPersistenceTimeout } from "@/lib/persistence/with-timeout";

/** Synthetic row — same pattern as audit-log / monitoring. */
export const OWNER_RUNTIME_CONFIG_USER_ID = "__atlas_owner_runtime_config__";

export type DurableLoadStatus = "ok" | "missing" | "unavailable" | "failed";

export type DurableLoadResult<T> =
  | { status: "ok"; payload: T; updatedAt: string }
  | { status: "missing" }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

export async function loadOwnerRuntimeDomain<T>(
  domain: string,
): Promise<DurableLoadResult<T>> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return { status: "unavailable" };

  return withPersistenceTimeout<DurableLoadResult<T>>(
    async () => {
      try {
        const { data, error } = await client
          .from(ATLAS_USER_STATE_TABLE)
          .select("payload, updated_at")
          .eq("user_id", OWNER_RUNTIME_CONFIG_USER_ID)
          .eq("domain", domain)
          .maybeSingle();

        if (error) {
          return { status: "failed", message: error.message };
        }
        if (!data) return { status: "missing" };
        return {
          status: "ok",
          payload: data.payload as T,
          updatedAt: data.updated_at,
        };
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof Error ? error.message : "load failed",
        };
      }
    },
    { status: "failed", message: "timeout" },
  );
}

export async function saveOwnerRuntimeDomain(
  domain: string,
  payload: unknown,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  return withPersistenceTimeout(async () => {
    try {
      const { error } = await client.from(ATLAS_USER_STATE_TABLE).upsert({
        user_id: OWNER_RUNTIME_CONFIG_USER_ID,
        domain,
        payload,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn(
          `[owner-runtime] persist failed (${domain}):`,
          error.message,
        );
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`[owner-runtime] persist skipped (${domain}):`, error);
      return false;
    }
  }, false);
}
