import { POPULARITY_FEATURE_IDS, getPopularityFeatureDefinition } from "./registry";
import type {
  PopularityFeatureId,
  PopularityUsageEvent,
} from "./types";

type EventBucket = PopularityUsageEvent[];

function getBucket(): EventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasPopularityRankingStore?: EventBucket;
  };

  if (!globalScope.__atlasPopularityRankingStore) {
    globalScope.__atlasPopularityRankingStore = [];
  }

  return globalScope.__atlasPopularityRankingStore;
}

export function recordPopularityUsage(input: {
  featureId: PopularityFeatureId;
  userId?: string | null;
  timestamp?: string;
}): PopularityUsageEvent {
  getPopularityFeatureDefinition(input.featureId);

  const event: PopularityUsageEvent = {
    featureId: input.featureId,
    userId: input.userId ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  getBucket().push(event);
  return event;
}

export function listPopularityUsageEvents(): PopularityUsageEvent[] {
  return [...getBucket()];
}

export function hasPopularityUsageRecords(
  featureId?: PopularityFeatureId,
): boolean {
  const events = getBucket();
  if (!featureId) return events.length > 0;
  return events.some((event) => event.featureId === featureId);
}

export function resetPopularityRankingStore(): void {
  getBucket().length = 0;
}

export function seedPopularityUsageEvents(
  events: readonly PopularityUsageEvent[],
): void {
  getBucket().push(...events);
}

export function listPopularityFeatureIds(): readonly PopularityFeatureId[] {
  return POPULARITY_FEATURE_IDS;
}
