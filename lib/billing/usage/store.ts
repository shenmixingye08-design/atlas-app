import type {
  AiUsageEvent,
  UsageCounters,
  UsageMonthKey,
  UsageSnapshot,
} from "./types";
import {
  incrementMonthlyAiAggregateFromEvent,
  resetMonthlyAiAggregates,
  replaceMonthlyAiAggregates,
  schedulePersistMonthlyAiAggregate,
  serializeMonthlyAiAggregates,
  type MonthlyAiAggregateRow,
} from "./monthly-aggregate";
import { getUsageDayKey as jstDayKey, getUsageMonthKey as jstMonthKey } from "./period";

type UsageBucket = Map<string, UsageSnapshot>;

function usageKey(userId: string, month: UsageMonthKey): string {
  return `${userId}:${month}`;
}

function getBucket(): UsageBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingUsageStore?: UsageBucket;
    __atlasBillingUsageHydrated?: boolean;
  };

  if (!globalScope.__atlasBillingUsageStore) {
    globalScope.__atlasBillingUsageStore = new Map();
  }

  if (!globalScope.__atlasBillingUsageHydrated) {
    globalScope.__atlasBillingUsageHydrated = true;
    if (
      !(globalScope as { __atlasBillingUsageSbHydrateStarted?: boolean })
        .__atlasBillingUsageSbHydrateStarted
    ) {
      (
        globalScope as { __atlasBillingUsageSbHydrateStarted?: boolean }
      ).__atlasBillingUsageSbHydrateStarted = true;
      void import("./durable")
        .then((mod) => mod.ensureBillingUsageHydrated())
        .catch(() => undefined);
    }
  }

  return globalScope.__atlasBillingUsageStore;
}

function getEventBucket(): AiUsageEvent[] {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingAiUsageEvents?: AiUsageEvent[];
  };

  if (!globalScope.__atlasBillingAiUsageEvents) {
    globalScope.__atlasBillingAiUsageEvents = [];
  }

  void getBucket();
  return globalScope.__atlasBillingAiUsageEvents;
}

function getClaimBucket(): Set<string> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingUsageClaimKeys?: Set<string>;
  };
  if (!globalScope.__atlasBillingUsageClaimKeys) {
    globalScope.__atlasBillingUsageClaimKeys = new Set();
  }
  return globalScope.__atlasBillingUsageClaimKeys;
}

/** Durable persist via Supabase only — no local filesystem. */
function persistDurable(): void {
  void import("./durable")
    .then((mod) => {
      mod.schedulePersistBillingUsage();
    })
    .catch(() => undefined);
}

export function normalizeUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  return {
    userId: snapshot.userId,
    month: snapshot.month,
    aiRuns: snapshot.aiRuns ?? 0,
    snsPosts: snapshot.snsPosts ?? 0,
    xUrlPosts: snapshot.xUrlPosts ?? 0,
    wordpressPosts: snapshot.wordpressPosts ?? 0,
    automationTasksActive: snapshot.automationTasksActive ?? 0,
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
  };
}

function emptySnapshot(userId: string, month: UsageMonthKey): UsageSnapshot {
  return {
    userId,
    month,
    aiRuns: 0,
    snsPosts: 0,
    xUrlPosts: 0,
    wordpressPosts: 0,
    automationTasksActive: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** Snapshot map for durable serialization (no secrets). */
export function serializeUsageSnapshots(): Record<string, UsageSnapshot> {
  return Object.fromEntries(getBucket().entries());
}

export function serializeUsageClaimKeys(): string[] {
  return [...getClaimBucket()];
}

/** Replace in-memory usage from durable hydrate. */
export function replaceUsageDurableState(input: {
  snapshots: Record<string, UsageSnapshot>;
  events: AiUsageEvent[];
  claimKeys?: string[];
  monthlyAggregates?: Record<string, MonthlyAiAggregateRow>;
}): void {
  const bucket = getBucket();
  bucket.clear();
  for (const [key, snapshot] of Object.entries(input.snapshots)) {
    if (snapshot?.userId && snapshot?.month) {
      bucket.set(key, normalizeUsageSnapshot(snapshot));
    }
  }
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingAiUsageEvents?: AiUsageEvent[];
    __atlasBillingUsageClaimKeys?: Set<string>;
  };
  globalScope.__atlasBillingAiUsageEvents = input.events.slice(-5000);
  globalScope.__atlasBillingUsageClaimKeys = new Set(input.claimKeys ?? []);
  if (input.monthlyAggregates) {
    replaceMonthlyAiAggregates(input.monthlyAggregates);
  }
}

export { serializeMonthlyAiAggregates };

export function getUsageMonthKey(now: Date = new Date()): UsageMonthKey {
  return jstMonthKey(now);
}

export function getUsageDayKey(now: Date = new Date()): string {
  return jstDayKey(now);
}

export function getUsageSnapshot(
  userId: string,
  month: UsageMonthKey = getUsageMonthKey(),
): UsageSnapshot {
  const existing = getBucket().get(usageKey(userId, month));
  if (existing) return normalizeUsageSnapshot(existing);
  return emptySnapshot(userId, month);
}

export function saveUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  const normalized = normalizeUsageSnapshot(snapshot);
  getBucket().set(usageKey(normalized.userId, normalized.month), normalized);
  persistDurable();
  return normalized;
}

export function incrementUsageCounter(
  userId: string,
  counter: keyof UsageCounters,
  amount = 1,
  month: UsageMonthKey = getUsageMonthKey(),
): UsageSnapshot {
  const current = getUsageSnapshot(userId, month);
  const next: UsageSnapshot = {
    ...current,
    [counter]: (current[counter] ?? 0) + amount,
    updatedAt: new Date().toISOString(),
  };

  return saveUsageSnapshot(next);
}

/**
 * Increment a counter at most once per stable claim / provider resource id.
 * Used so X/WordPress worker retries after provider success do not double-count.
 */
export function incrementUsageCounterOnce(
  userId: string,
  counter: keyof UsageCounters,
  claimKey: string,
  amount = 1,
  month: UsageMonthKey = getUsageMonthKey(),
): { incremented: boolean; snapshot: UsageSnapshot } {
  const stable = claimKey.trim();
  if (!stable) {
    return { incremented: false, snapshot: getUsageSnapshot(userId, month) };
  }
  const key = `${userId}:${month}:${counter}:${stable}`;
  const claims = getClaimBucket();
  if (claims.has(key)) {
    return { incremented: false, snapshot: getUsageSnapshot(userId, month) };
  }
  claims.add(key);
  const snapshot = incrementUsageCounter(userId, counter, amount, month);
  return { incremented: true, snapshot };
}

export function setAutomationTaskCount(
  userId: string,
  count: number,
  month: UsageMonthKey = getUsageMonthKey(),
): UsageSnapshot {
  const current = getUsageSnapshot(userId, month);
  return saveUsageSnapshot({
    ...current,
    automationTasksActive: count,
    updatedAt: new Date().toISOString(),
  });
}

export function appendAiUsageEvent(event: AiUsageEvent): AiUsageEvent {
  const bucket = getEventBucket();
  bucket.push(event);
  if (bucket.length > 5000) {
    bucket.splice(0, bucket.length - 5000);
  }
  const aggregate = incrementMonthlyAiAggregateFromEvent(event);
  schedulePersistMonthlyAiAggregate({
    userId: aggregate.userId,
    month: aggregate.month,
    model: aggregate.model,
    feature: aggregate.feature,
    requests: event.requestCount,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costUsd: event.estimatedCostUsd,
  });
  persistDurable();
  return event;
}

export function listAiUsageEvents(userId?: string): AiUsageEvent[] {
  const events = getEventBucket();
  if (!userId) return [...events];
  return events.filter((event) => event.userId === userId);
}

export function resetUsageStore(): void {
  getBucket().clear();
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingAiUsageEvents?: AiUsageEvent[];
    __atlasBillingUsageClaimKeys?: Set<string>;
  };
  if (globalScope.__atlasBillingAiUsageEvents) {
    globalScope.__atlasBillingAiUsageEvents.length = 0;
  }
  globalScope.__atlasBillingUsageClaimKeys = new Set();
  resetMonthlyAiAggregates();
  persistDurable();
}
