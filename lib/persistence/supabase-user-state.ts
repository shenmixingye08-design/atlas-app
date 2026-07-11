import "server-only";

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
  if (!client) return false;

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

export async function loadSupabaseUserState<T>(
  userId: string,
  domain: string,
): Promise<{ payload: T; updatedAt: string } | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

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
}
