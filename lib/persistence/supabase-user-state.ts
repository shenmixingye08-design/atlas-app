import "server-only";

import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";
import { withPersistenceTimeout } from "@/lib/persistence/with-timeout";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export const ATLAS_USER_STATE_TABLE = "atlas_user_state" as const;

type UserStateRow = {
  user_id: string;
  domain: string;
  payload: unknown;
  updated_at: string;
};

/** Full payload upsert via service role (RLS denies anon). */
export async function upsertSupabaseUserState(
  userId: string,
  domain: string,
  payload: unknown,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    warnIfProductionSupabaseServiceRoleMissing(`atlas_user_state:${domain}`);
    return false;
  }

  return withPersistenceTimeout(async () => {
    try {
      const row: UserStateRow = {
        user_id: userId,
        domain,
        payload,
        updated_at: new Date().toISOString(),
      };
      const { error } = await client.from(ATLAS_USER_STATE_TABLE).upsert(row);
      if (error) {
        console.warn(
          `[persistence] Supabase user_state upsert failed (${domain}):`,
          error.message,
        );
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`[persistence] Supabase user_state skipped (${domain}):`, error);
      return false;
    }
  }, false);
}

/** List user ids that have a durable domain row (for cron fan-out). */
export async function listSupabaseUserIdsForDomain(
  domain: string,
): Promise<string[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(ATLAS_USER_STATE_TABLE)
      .select("user_id")
      .eq("domain", domain);

    if (error || !Array.isArray(data)) return [];
    return data
      .map((row) => (typeof row.user_id === "string" ? row.user_id : ""))
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

/** Delete durable domain rows for a user (account purge). */
export async function deleteSupabaseUserDomains(
  userId: string,
  domains: readonly string[],
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client || domains.length === 0) return false;

  try {
    const { error } = await client
      .from(ATLAS_USER_STATE_TABLE)
      .delete()
      .eq("user_id", userId)
      .in("domain", [...domains]);

    if (error) {
      console.warn(
        `[persistence] Supabase user_state delete failed:`,
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[persistence] Supabase user_state delete skipped:`, error);
    return false;
  }
}

export async function loadSupabaseUserState<T>(
  userId: string,
  domain: string,
): Promise<{ payload: T; updatedAt: string } | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  return withPersistenceTimeout<{ payload: T; updatedAt: string } | null>(
    async () => {
      try {
        const { data, error } = await client
          .from(ATLAS_USER_STATE_TABLE)
          .select("payload, updated_at")
          .eq("user_id", userId)
          .eq("domain", domain)
          .maybeSingle();

        if (error || !data) return null;
        return {
          payload: data.payload as T,
          updatedAt: data.updated_at,
        };
      } catch {
        return null;
      }
    },
    null,
  );
}
