import type {
  CategoryLearningRule,
  HouseholdLedgerState,
  LedgerEntry,
  ReceiptSession,
} from "./types";
import {
  dbDeleteLedgerEntryForUser,
  dbGetLedgerEntryForUser,
  dbListLedgerEntries,
  dbUpdateLedgerEntryForUser,
  dbUpsertLedgerEntries,
  inferEntrySource,
  resetHouseholdLedgerDbStoreForTests,
  type LedgerListOptions,
} from "./repository/db-store";

type GlobalScope = typeof globalThis & {
  __atlasHouseholdLedgerStore?: Map<string, HouseholdLedgerState>;
  __atlasHouseholdLedgerHydrated?: Set<string>;
};

function buckets(): Map<string, HouseholdLedgerState> {
  const scope = globalThis as GlobalScope;
  if (!scope.__atlasHouseholdLedgerStore) {
    scope.__atlasHouseholdLedgerStore = new Map();
  }
  return scope.__atlasHouseholdLedgerStore;
}

function hydrated(): Set<string> {
  const scope = globalThis as GlobalScope;
  if (!scope.__atlasHouseholdLedgerHydrated) {
    scope.__atlasHouseholdLedgerHydrated = new Set();
  }
  return scope.__atlasHouseholdLedgerHydrated;
}

function emptyMetaState(): HouseholdLedgerState {
  // entries are never the durable SoT in this Map — DB is.
  return { entries: [], categoryRules: [], sessions: [] };
}

export function getHouseholdLedgerState(userId: string): HouseholdLedgerState {
  return buckets().get(userId) ?? emptyMetaState();
}

export function setHouseholdLedgerState(
  userId: string,
  state: HouseholdLedgerState,
): void {
  buckets().set(userId, {
    ...state,
    // Never keep entries as durable SoT in process memory.
    entries: [],
  });
}

export function isHouseholdLedgerHydrated(userId: string): boolean {
  return hydrated().has(userId);
}

export function markHouseholdLedgerHydrated(userId: string): void {
  hydrated().add(userId);
}

export async function listLedgerEntries(
  userId: string,
  options?: LedgerListOptions,
): Promise<LedgerEntry[]> {
  return dbListLedgerEntries(userId, options);
}

export function listCategoryRules(userId: string): CategoryLearningRule[] {
  return [...getHouseholdLedgerState(userId).categoryRules];
}

export async function upsertLedgerEntries(
  userId: string,
  entries: LedgerEntry[],
): Promise<void> {
  const owned = entries.filter((entry) => entry.userId === userId);
  if (owned.length === 0) return;
  const source = inferEntrySource(owned[0]!);
  await dbUpsertLedgerEntries(owned, { source });
}

export async function getLedgerEntryForUser(
  userId: string,
  entryId: string,
): Promise<LedgerEntry | null> {
  return dbGetLedgerEntryForUser(userId, entryId);
}

export async function updateLedgerEntryForUser(
  userId: string,
  entryId: string,
  patch: Parameters<typeof dbUpdateLedgerEntryForUser>[2],
): Promise<LedgerEntry | null> {
  return dbUpdateLedgerEntryForUser(userId, entryId, patch);
}

export async function deleteLedgerEntryForUser(
  userId: string,
  entryId: string,
): Promise<boolean> {
  return dbDeleteLedgerEntryForUser(userId, entryId);
}

export function replaceCategoryRules(
  userId: string,
  rules: CategoryLearningRule[],
): void {
  const state = getHouseholdLedgerState(userId);
  setHouseholdLedgerState(userId, { ...state, categoryRules: rules });
}

export function saveReceiptSession(
  userId: string,
  session: ReceiptSession,
): void {
  const state = getHouseholdLedgerState(userId);
  const sessions = [
    session,
    ...state.sessions.filter((row) => row.id !== session.id),
  ].slice(0, 40);
  setHouseholdLedgerState(userId, { ...state, sessions });
}

export function getReceiptSession(
  userId: string,
  sessionId: string,
): ReceiptSession | null {
  return (
    getHouseholdLedgerState(userId).sessions.find((row) => row.id === sessionId) ??
    null
  );
}

/** Clears process cache only (DB stand-in remains) — restart durability tests. */
export function resetHouseholdLedgerProcessCacheForTests(): void {
  buckets().clear();
  hydrated().clear();
}

export function resetHouseholdLedgerStoreForTests(): void {
  resetHouseholdLedgerProcessCacheForTests();
  resetHouseholdLedgerDbStoreForTests();
}
