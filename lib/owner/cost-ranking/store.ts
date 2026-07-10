import { COST_FEATURE_IDS, getCostFeatureDefinition } from "./registry";
import type { CostFeatureId, CostUsageEvent } from "./types";

type EventBucket = CostUsageEvent[];

function getBucket(): EventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasCostRankingStore?: EventBucket;
  };

  if (!globalScope.__atlasCostRankingStore) {
    globalScope.__atlasCostRankingStore = [];
  }

  return globalScope.__atlasCostRankingStore;
}

export function recordCostUsage(input: {
  featureId: CostFeatureId;
  userId?: string | null;
  costUsd: number;
  durationMs: number;
  timestamp?: string;
  source?: CostUsageEvent["source"];
}): CostUsageEvent {
  getCostFeatureDefinition(input.featureId);

  const event: CostUsageEvent = {
    featureId: input.featureId,
    userId: input.userId ?? null,
    costUsd: Math.max(0, input.costUsd),
    durationMs: Math.max(0, input.durationMs),
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source ?? "orchestration",
  };

  getBucket().push(event);
  return event;
}

export function listCostUsageEvents(): CostUsageEvent[] {
  return [...getBucket()];
}

export function hasCostUsageRecords(): boolean {
  return getBucket().length > 0;
}

export function resetCostRankingStore(): void {
  getBucket().length = 0;
}

export function seedCostUsageEvents(
  events: readonly CostUsageEvent[],
): void {
  getBucket().push(...events);
}

export function listCostFeatureIds(): readonly CostFeatureId[] {
  return COST_FEATURE_IDS;
}
