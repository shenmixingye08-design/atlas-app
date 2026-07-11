import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import type {
  AiUsageEvent,
  UsageCounters,
  UsageMonthKey,
  UsageSnapshot,
} from "./types";

type UsageBucket = Map<string, UsageSnapshot>;

const DATA_DIR = path.join(process.cwd(), ".data", "billing");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

type UsageFileShape = {
  version: 1;
  snapshots: Record<string, UsageSnapshot>;
  events: AiUsageEvent[];
};

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
    hydrateFromDisk(globalScope.__atlasBillingUsageStore);
    globalScope.__atlasBillingUsageHydrated = true;
  }

  return globalScope.__atlasBillingUsageStore;
}

function getEventBucket(): AiUsageEvent[] {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingAiUsageEvents?: AiUsageEvent[];
    __atlasBillingUsageHydrated?: boolean;
  };

  if (!globalScope.__atlasBillingAiUsageEvents) {
    globalScope.__atlasBillingAiUsageEvents = [];
  }

  // Ensure counters hydrate first (also loads events).
  void getBucket();

  return globalScope.__atlasBillingAiUsageEvents;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hydrateFromDisk(bucket: UsageBucket): void {
  try {
    if (!existsSync(USAGE_FILE)) return;
    const raw = readFileSync(USAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as UsageFileShape;
    if (parsed?.snapshots && typeof parsed.snapshots === "object") {
      for (const [key, snapshot] of Object.entries(parsed.snapshots)) {
        if (snapshot?.userId && snapshot?.month) {
          bucket.set(key, snapshot);
        }
      }
    }
    const globalScope = globalThis as typeof globalThis & {
      __atlasBillingAiUsageEvents?: AiUsageEvent[];
    };
    if (Array.isArray(parsed?.events)) {
      globalScope.__atlasBillingAiUsageEvents = parsed.events.slice(-5000);
    }
  } catch {
    // Best-effort hydrate — keep empty in-memory state.
  }
}

function persistToDisk(): void {
  try {
    ensureDataDir();
    const snapshots = Object.fromEntries(getBucket().entries());
    const events = getEventBucket().slice(-5000);
    const payload: UsageFileShape = {
      version: 1,
      snapshots,
      events,
    };
    writeFileSync(USAGE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("[billing] Failed to persist usage to disk:", error);
  }
}

export function getUsageMonthKey(now: Date = new Date()): UsageMonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsageDayKey(now: Date = new Date()): string {
  return `${getUsageMonthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
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
  persistToDisk();
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

export function appendAiUsageEvent(event: AiUsageEvent): AiUsageEvent {
  const bucket = getEventBucket();
  bucket.push(event);
  if (bucket.length > 5000) {
    bucket.splice(0, bucket.length - 5000);
  }
  persistToDisk();
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
  };
  if (globalScope.__atlasBillingAiUsageEvents) {
    globalScope.__atlasBillingAiUsageEvents.length = 0;
  }
  persistToDisk();
}
