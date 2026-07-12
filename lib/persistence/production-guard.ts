import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

/**
 * Production must have service-role credentials for durable overflow / globals.
 * Returns false (and logs) when missing — callers must not pretend a durable write succeeded.
 */
export function warnIfProductionSupabaseServiceRoleMissing(
  context: string,
): boolean {
  if (!isAtlasProduction()) return true;
  if (getSupabaseServiceRoleEnv()) return true;

  console.error(
    `[persistence] Production durable write blocked (${context}): ` +
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required. " +
      "In-memory / local fallback is not treated as a successful durable save.",
  );
  return false;
}
