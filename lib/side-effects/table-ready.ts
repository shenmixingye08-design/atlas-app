import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

let cachedReady: boolean | null = null;
let cachedAtMs = 0;
let inflight: Promise<boolean> | null = null;

const READY_TTL_MS = 5 * 60_000;
const NOT_READY_TTL_MS = 30_000;

function isMissing(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function probeOnce(): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;
  const { error } = await client
    .from("atlas_side_effect_claims")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (isMissing(error.message)) return false;
  console.warn(
    "[side-effects] probe unexpected error (treating as ready):",
    error.message,
  );
  return true;
}

export async function isSideEffectIdempotencyReady(): Promise<boolean> {
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

export function resetSideEffectIdempotencyReadyCache(): void {
  cachedReady = null;
  cachedAtMs = 0;
  inflight = null;
}

export function markSideEffectIdempotencyReadyUnknown(): void {
  cachedReady = null;
  cachedAtMs = 0;
}

export function setSideEffectIdempotencyReadyForTests(
  ready: boolean | null,
): void {
  cachedReady = ready;
  cachedAtMs = Date.now();
}
