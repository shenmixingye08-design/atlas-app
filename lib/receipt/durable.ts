import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import { backfillHouseholdLedgerEntriesFromDurable } from "./repository/backfill";
import {
  getHouseholdLedgerState,
  isHouseholdLedgerHydrated,
  markHouseholdLedgerHydrated,
  setHouseholdLedgerState,
} from "./store";
import type { HouseholdLedgerState } from "./types";

export const HOUSEHOLD_LEDGER_DOMAIN_KEY = "atlasHouseholdLedger";

/**
 * Persist only non-entry metadata to atlas_user_state.
 * Ledger entries must NOT use JSON as Production SoT (P1-05).
 */
function compactMeta(state: HouseholdLedgerState): HouseholdLedgerState {
  return {
    // Explicit empty — entries live in atlas_household_ledger_entries.
    entries: [],
    categoryRules: state.categoryRules.slice(0, 80),
    sessions: state.sessions.slice(0, 5).map((session) => ({
      ...session,
      schemas: session.schemas.slice(0, 2),
      entriesPreview: session.entriesPreview.slice(0, 20),
    })),
  };
}

export function snapshotHouseholdLedger(userId: string): HouseholdLedgerState {
  const state = getHouseholdLedgerState(userId);
  return {
    entries: [],
    categoryRules: state.categoryRules,
    sessions: state.sessions,
  };
}

export function schedulePersistHouseholdLedger(userId: string): void {
  void persistDurableDomain(
    userId,
    HOUSEHOLD_LEDGER_DOMAIN_KEY,
    snapshotHouseholdLedger(userId),
    { compact: compactMeta, forceSupabase: true },
  );
}

export async function ensureHouseholdLedgerHydrated(
  userId: string,
): Promise<void> {
  if (isHouseholdLedgerHydrated(userId)) return;
  const loaded = await loadDurableDomain<HouseholdLedgerState>(
    userId,
    HOUSEHOLD_LEDGER_DOMAIN_KEY,
  );
  setHouseholdLedgerState(userId, {
    entries: [],
    categoryRules: loaded?.categoryRules ?? [],
    sessions: loaded?.sessions ?? [],
  });
  // One-time-safe idempotent move of any legacy JSON entries → dedicated table.
  if (loaded?.entries && loaded.entries.length > 0) {
    await backfillHouseholdLedgerEntriesFromDurable(userId);
  }
  markHouseholdLedgerHydrated(userId);
}
