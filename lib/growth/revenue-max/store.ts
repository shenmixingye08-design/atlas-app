import type { RevenueMaxEvent, RevenueMaxUserState } from "./types";

function emptyState(userId: string): RevenueMaxUserState {
  return {
    userId,
    registeredAt: null,
    pain: null,
    usecase: null,
    onboardingStartedAt: null,
    firstRequestAt: null,
    firstSuccessAt: null,
    firstFailAt: null,
    lastValueAt: null,
    lastFailMessage: null,
    lastSuccessSummary: null,
    hadPaid: false,
    checkoutSessionId: null,
    checkoutStartedAt: null,
    checkoutOutcome: null,
    checkoutFailClass: null,
    resumeShownAt: null,
    atRiskShownAt: null,
    upgradeDismissedAt: null,
    lastUpgradeViewedPlan: null,
    variants: {},
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

type Bucket = {
  users: Map<string, RevenueMaxUserState>;
};

function getBucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRevenueMaxStore?: Bucket;
  };
  if (!globalScope.__atlasRevenueMaxStore) {
    globalScope.__atlasRevenueMaxStore = { users: new Map() };
  }
  return globalScope.__atlasRevenueMaxStore;
}

export function getRevenueMaxState(userId: string): RevenueMaxUserState {
  const existing = getBucket().users.get(userId);
  if (!existing) return emptyState(userId);
  return {
    ...existing,
    variants: { ...existing.variants },
    events: existing.events.map((event) => ({
      ...event,
      metadata: { ...event.metadata },
    })),
  };
}

export function setRevenueMaxState(state: RevenueMaxUserState): RevenueMaxUserState {
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
    events: state.events.slice(0, 400),
  };
  getBucket().users.set(state.userId, next);
  return getRevenueMaxState(state.userId);
}

export function listRevenueMaxStates(): RevenueMaxUserState[] {
  return [...getBucket().users.values()].map((row) => getRevenueMaxState(row.userId));
}

export function findEventByDedupe(
  userId: string,
  dedupeKey: string,
): RevenueMaxEvent | null {
  return getRevenueMaxState(userId).events.find((event) => event.dedupeKey === dedupeKey) ?? null;
}

export function resetRevenueMaxStoreForTests(): void {
  getBucket().users = new Map();
}

export function replaceRevenueMaxUsers(states: RevenueMaxUserState[]): void {
  const bucket = getBucket();
  bucket.users = new Map(states.map((row) => [row.userId, row]));
}
