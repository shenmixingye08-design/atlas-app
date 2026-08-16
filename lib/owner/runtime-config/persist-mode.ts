import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type OwnerRuntimePersistMode = "durable" | "memory" | "blocked";

/**
 * Owner runtime mutations (flags / maintenance / runtime beta).
 * Production without Supabase service role must not pretend a toggle worked.
 */
export function getOwnerRuntimePersistMode(): OwnerRuntimePersistMode {
  if (getSupabaseServiceRoleEnv()) return "durable";
  if (isAtlasProduction()) return "blocked";
  return "memory";
}

export function ownerRuntimeMutationBlockedMessage(): string {
  return "本番では永続ストア未設定のため、この操作は利用できません。";
}
