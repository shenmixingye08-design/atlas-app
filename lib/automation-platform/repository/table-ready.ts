import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

let cachedReady: boolean | null = null;
let cachedAtMs = 0;
let inflight: Promise<boolean> | null = null;

const READY_TTL_MS = 5 * 60_000;
const NOT_READY_TTL_MS = 30_000;

function isMissingTableError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function probeOnce(): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error: automationsError } = await client
    .from("atlas_automations")
    .select("id")
    .limit(1);
  if (automationsError) {
    if (isMissingTableError(automationsError.message)) return false;
    // Unexpected errors → treat as ready so we don't silently divert writes.
    console.warn(
      "[automation-v2] atlas_automations probe unexpected error (treating as ready):",
      automationsError.message,
    );
    return true;
  }

  const { error: runsError } = await client
    .from("atlas_automation_runs")
    .select("id, payload, next_retry_at")
    .limit(1);
  if (runsError) {
    if (
      isMissingTableError(runsError.message) ||
      /column .*payload|next_retry_at/i.test(runsError.message)
    ) {
      return false;
    }
    console.warn(
      "[automation-v2] atlas_automation_runs probe unexpected error (treating as ready):",
      runsError.message,
    );
    return true;
  }

  return true;
}

/** True when atlas_automations + atlas_automation_runs(+payload) are usable. */
export async function isAutomationV2DbSotReady(): Promise<boolean> {
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

export function resetAutomationV2DbSotReadyCache(): void {
  cachedReady = null;
  cachedAtMs = 0;
  inflight = null;
}

export function markAutomationV2DbSotReadyUnknown(): void {
  cachedReady = null;
  cachedAtMs = 0;
}

/** Test helper: force readiness without probing Supabase. */
export function setAutomationV2DbSotReadyForTests(ready: boolean | null): void {
  cachedReady = ready;
  cachedAtMs = Date.now();
}
