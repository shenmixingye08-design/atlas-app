import type {
  AiUsageEvent,
  UsageCounters,
  UsageMonthKey,
  UsageSnapshot,
} from "./types";

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

/** Durable persist via Supabase only — no local filesystem. */
function persistDurable(): void {
  void import("./durable")
    .then((mod) => {
      mod.schedulePersistBillingUsage();
    })
    .catch(() => undefined);
}

/** Snapshot map for durable serialization (no secrets). */
export function serializeUsageSnapshots(): Record<string, UsageSnapshot> {
  return Object.fromEntries(getBucket().entries());
}

/** Replace in-memory usage from durable hydrate. */
export function replaceUsageDurableState(input: {
  snapshots: Record<string, UsageSnapshot>;
  events: AiUsageEvent[];
}): void {
  const bucket = getBucket();
  bucket.clear();
  for (const [key, snapshot] of Object.entries(input.snapshots)) {
    if (snapshot?.userId && snapshot?.month) {
      bucket.set(key, snapshot);
    }
  }
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingAiUsageEvents?: AiUsageEvent[];
  };
  globalScope.__atlasBillingAiUsageEvents = input.events.slice(-5000);
}

export function getUsageMonthKey(now: Date = new Date()): UsageMonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsageDayKey(now: Date = new Date()): string {
  return `${getUsageMonthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyUsageSnapshot(
  userId: string,
  month: UsageMonthKey,
): UsageSnapshot {
  return {
    userId,
    month,
    aiRuns: 0,
    snsPosts: 0,
    automationTasksActive: 0,
    deliverable_word: 0,
    deliverable_excel: 0,
    deliverable_image: 0,
    deliverable_pdf: 0,
    deliverable_powerpoint: 0,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  return {
    ...emptyUsageSnapshot(snapshot.userId, snapshot.month),
    ...snapshot,
    deliverable_word: snapshot.deliverable_word ?? 0,
    deliverable_excel: snapshot.deliverable_excel ?? 0,
    deliverable_image: snapshot.deliverable_image ?? 0,
    deliverable_pdf: snapshot.deliverable_pdf ?? 0,
    deliverable_powerpoint: snapshot.deliverable_powerpoint ?? 0,
  };
}

export function getUsageSnapshot(
  userId: string,
  month: UsageMonthKey = getUsageMonthKey(),
): UsageSnapshot {
  const existing = getBucket().get(usageKey(userId, month));
  if (existing) return normalizeUsageSnapshot(existing);

  return emptyUsageSnapshot(userId, month);
}

export function saveUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  getBucket().set(usageKey(snapshot.userId, snapshot.month), snapshot);
  persistDurable();
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
  };
  if (globalScope.__atlasBillingAiUsageEvents) {
    globalScope.__atlasBillingAiUsageEvents.length = 0;
  }
  persistDurable();
}
