import type {
  CategoryLearningRule,
  HouseholdLedgerState,
  LedgerEntry,
  ReceiptSession,
} from "./types";

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

function emptyState(): HouseholdLedgerState {
  return { entries: [], categoryRules: [], sessions: [] };
}

export function getHouseholdLedgerState(userId: string): HouseholdLedgerState {
  return buckets().get(userId) ?? emptyState();
}

export function setHouseholdLedgerState(
  userId: string,
  state: HouseholdLedgerState,
): void {
  buckets().set(userId, state);
}

export function isHouseholdLedgerHydrated(userId: string): boolean {
  return hydrated().has(userId);
}

export function markHouseholdLedgerHydrated(userId: string): void {
  hydrated().add(userId);
}

export function listLedgerEntries(userId: string): LedgerEntry[] {
  return [...getHouseholdLedgerState(userId).entries];
}

export function listCategoryRules(userId: string): CategoryLearningRule[] {
  return [...getHouseholdLedgerState(userId).categoryRules];
}

export function upsertLedgerEntries(
  userId: string,
  entries: LedgerEntry[],
): void {
  const state = getHouseholdLedgerState(userId);
  const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) byId.set(entry.id, entry);
  setHouseholdLedgerState(userId, {
    ...state,
    entries: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)),
  });
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

export function resetHouseholdLedgerStoreForTests(): void {
  buckets().clear();
  hydrated().clear();
}
