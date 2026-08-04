import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

/**
 * Lightweight readiness gate for public.atlas_billing_subscriptions.
 * Does NOT attempt DDL (service role cannot create tables).
 * When false, billing persistence uses atlas_user_state domains instead.
 */

let cachedReady: boolean | null = null;
let cachedAtMs = 0;
let inflight: Promise<boolean> | null = null;

const READY_TTL_MS = 5 * 60_000;
const NOT_READY_TTL_MS = 60_000;

function isMissingTableError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function probeOnce(): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error } = await client
    .from("atlas_billing_subscriptions")
    .select("user_id")
    .eq("user_id", "__atlas_billing_ready_probe__")
    .maybeSingle();

  if (!error) return true;
  if (isMissingTableError(error.message)) return false;

  // Table exists but another error (RLS/network) — treat as ready so we don't
  // silently divert writes away from the dedicated table.
  console.warn(
    "[billing] dedicated table probe unexpected error (treating as ready):",
    error.message,
  );
  return true;
}

/** Cached probe: true when atlas_billing_subscriptions is in schema cache. */
export async function isBillingDedicatedTableReady(): Promise<boolean> {
  const now = Date.now();
  if (cachedReady === true && now - cachedAtMs < READY_TTL_MS) return true;
  if (cachedReady === false && now - cachedAtMs < NOT_READY_TTL_MS) return false;

  if (!inflight) {
    inflight = probeOnce()
      .then((ready) => {
        cachedReady = ready;
        cachedAtMs = Date.now();
        if (!ready) {
          // One structured notice — not per /api/commander warn spam.
          console.info(
            "[billing] atlas_billing_subscriptions not in schema cache; " +
              "using atlas_user_state domain atlasBilling until " +
              "GET /api/health/billing-schema?apply=1 succeeds " +
              "(requires POSTGRES_URL or SUPABASE_ACCESS_TOKEN).",
          );
        }
        return ready;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test / post-apply helper. */
export function resetBillingDedicatedTableReadyCache(): void {
  cachedReady = null;
  cachedAtMs = 0;
  inflight = null;
}

/** After successful DDL apply, force next probe. */
export function markBillingDedicatedTableReadyUnknown(): void {
  cachedReady = null;
  cachedAtMs = 0;
}
