import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { RATE_LIMIT_RPC, RATE_LIMIT_TABLE } from "./migration-sql";

let cachedReady: boolean | null = null;
let cachedAtMs = 0;
let inflight: Promise<boolean> | null = null;

const READY_TTL_MS = 5 * 60_000;
const NOT_READY_TTL_MS = 30_000;

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the (table|function)|function .* does not exist/i.test(
        message,
      ),
  );
}

async function probeOnce(): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error: tableError } = await client
    .from(RATE_LIMIT_TABLE)
    .select("id, bucket, subject_key, hit_count")
    .limit(1);
  if (tableError) {
    if (isMissingError(tableError.message)) return false;
    console.warn(
      "[rate-limit] table probe unexpected error (treating as ready):",
      tableError.message,
    );
  }

  // Probe RPC presence with a harmless dry call that will still fail closed on missing fn.
  const { error: rpcError } = await client.rpc(RATE_LIMIT_RPC, {
    p_bucket: "__atlas_probe__",
    p_subject_key: "__atlas_probe__",
    p_max: 1,
    p_window_ms: 60_000,
    p_min_interval_ms: 0,
  });
  if (rpcError && isMissingError(rpcError.message)) return false;
  return true;
}

export async function isDistributedRateLimitReady(): Promise<boolean> {
  const now = Date.now();
  if (cachedReady === true && now - cachedAtMs < READY_TTL_MS) return true;
  if (cachedReady === false && now - cachedAtMs < NOT_READY_TTL_MS) return false;

  if (!inflight) {
    inflight = probeOnce()
      .then((ready) => {
        cachedReady = ready;
        cachedAtMs = Date.now();
        return ready;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function resetDistributedRateLimitReadyCache(): void {
  cachedReady = null;
  cachedAtMs = 0;
  inflight = null;
}

export function markDistributedRateLimitReadyUnknown(): void {
  cachedReady = null;
  cachedAtMs = 0;
}

export function setDistributedRateLimitReadyForTests(
  ready: boolean | null,
): void {
  cachedReady = ready;
  cachedAtMs = Date.now();
}
