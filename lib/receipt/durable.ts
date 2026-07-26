import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import {
  getHouseholdLedgerState,
  isHouseholdLedgerHydrated,
  markHouseholdLedgerHydrated,
  setHouseholdLedgerState,
} from "./store";
import type { HouseholdLedgerState } from "./types";

export const HOUSEHOLD_LEDGER_DOMAIN_KEY = "atlasHouseholdLedger";

const MAX_CLERK_ENTRIES = 40;

function compact(state: HouseholdLedgerState): HouseholdLedgerState {
  return {
    categoryRules: state.categoryRules.slice(0, 80),
    sessions: state.sessions.slice(0, 5).map((session) => ({
      ...session,
      schemas: session.schemas.slice(0, 2),
      entriesPreview: session.entriesPreview.slice(0, 20),
    })),
    entries: state.entries.slice(0, MAX_CLERK_ENTRIES).map((entry) => ({
      ...entry,
      note: entry.note.slice(0, 120),
    })),
  };
}

export function snapshotHouseholdLedger(userId: string): HouseholdLedgerState {
  return getHouseholdLedgerState(userId);
}

export function schedulePersistHouseholdLedger(userId: string): void {
  void persistDurableDomain(
    userId,
    HOUSEHOLD_LEDGER_DOMAIN_KEY,
    snapshotHouseholdLedger(userId),
    { compact, forceSupabase: true },
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
  if (loaded?.entries) {
    setHouseholdLedgerState(userId, {
      entries: loaded.entries ?? [],
      categoryRules: loaded.categoryRules ?? [],
      sessions: loaded.sessions ?? [],
    });
  }
  markHouseholdLedgerHydrated(userId);
}
