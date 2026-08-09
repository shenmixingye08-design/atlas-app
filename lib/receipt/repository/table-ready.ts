import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { HOUSEHOLD_LEDGER_TABLE } from "./migration-sql";

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

  const { error } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select("id, user_id, amount, currency, occurred_at, occurred_on")
    .limit(1);
  if (error) {
    if (isMissingTableError(error.message)) return false;
    console.warn(
      "[household-ledger] table probe unexpected error (treating as ready):",
      error.message,
    );
    return true;
  }
  return true;
}

/** True when atlas_household_ledger_entries is usable. */
export async function isHouseholdLedgerTableReady(): Promise<boolean> {
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

export function resetHouseholdLedgerTableReadyCache(): void {
  cachedReady = null;
  cachedAtMs = 0;
  inflight = null;
}

export function markHouseholdLedgerTableReadyUnknown(): void {
  cachedReady = null;
  cachedAtMs = 0;
}

/** Test helper: force readiness without probing Supabase. */
export function setHouseholdLedgerTableReadyForTests(
  ready: boolean | null,
): void {
  cachedReady = ready;
  cachedAtMs = Date.now();
}
