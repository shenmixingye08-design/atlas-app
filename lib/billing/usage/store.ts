import type { UsageCounters, UsageMonthKey, UsageSnapshot } from "./types";

type UsageBucket = Map<string, UsageSnapshot>;

function usageKey(userId: string, month: UsageMonthKey): string {
  return `${userId}:${month}`;
}

function getBucket(): UsageBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingUsageStore?: UsageBucket;
  };

  if (!globalScope.__atlasBillingUsageStore) {
    globalScope.__atlasBillingUsageStore = new Map();
  }

  return globalScope.__atlasBillingUsageStore;
}

export function getUsageMonthKey(now: Date = new Date()): UsageMonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsageSnapshot(
  userId: string,
  month: UsageMonthKey = getUsageMonthKey(),
): UsageSnapshot {
  const existing = getBucket().get(usageKey(userId, month));
  if (existing) return existing;

  return {
    userId,
    month,
    aiRuns: 0,
    snsPosts: 0,
    automationTasksActive: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function saveUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  getBucket().set(usageKey(snapshot.userId, snapshot.month), snapshot);
  return snapshot;
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
    [counter]: current[counter] + amount,
    updatedAt: new Date().toISOString(),
  };

  return saveUsageSnapshot(next);
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

export function resetUsageStore(): void {
  getBucket().clear();
}
