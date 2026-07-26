import type { AssistantPeriod, ManagementSummary } from "./types";

type CacheEntry = {
  period: AssistantPeriod;
  factsHash: string;
  summary: ManagementSummary;
  aiSuggestions: readonly string[];
  expiresAt: number;
};

function getBucket(): Map<string, CacheEntry> {
  const scope = globalThis as typeof globalThis & {
    __atlasOwnerAiAssistantCache?: Map<string, CacheEntry>;
  };
  if (!scope.__atlasOwnerAiAssistantCache) {
    scope.__atlasOwnerAiAssistantCache = new Map();
  }
  return scope.__atlasOwnerAiAssistantCache;
}

function cacheKey(period: AssistantPeriod, factsHash: string): string {
  return `${period}:${factsHash}`;
}

function ttlMs(period: AssistantPeriod): number {
  if (period === "day") return 6 * 60 * 60 * 1000;
  if (period === "week") return 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function getAssistantAiCache(
  period: AssistantPeriod,
  factsHash: string,
): CacheEntry | null {
  const key = cacheKey(period, factsHash);
  const entry = getBucket().get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    getBucket().delete(key);
    return null;
  }
  return entry;
}

export function setAssistantAiCache(input: {
  period: AssistantPeriod;
  factsHash: string;
  summary: ManagementSummary;
  aiSuggestions: readonly string[];
}): void {
  getBucket().set(cacheKey(input.period, input.factsHash), {
    period: input.period,
    factsHash: input.factsHash,
    summary: { ...input.summary, cached: true },
    aiSuggestions: input.aiSuggestions,
    expiresAt: Date.now() + ttlMs(input.period),
  });
}

export function resetAssistantAiCacheForTests(): void {
  getBucket().clear();
}
