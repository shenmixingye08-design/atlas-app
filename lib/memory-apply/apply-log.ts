/**
 * Memory apply audit log — which Memory was used, on which artifact,
 * before/after diff, token delta, improvement rate.
 *
 * Process buffer + durable domain (not localStorage).
 */

import "server-only";

import type { MemoryApplyChannel, MemoryApplyMode } from "@/lib/memory-apply/types";
import type { MemoryQualityDiff } from "@/lib/memory-apply/types";
import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

export const MEMORY_APPLY_LOG_DOMAIN_KEY = "atlasMemoryApplyLog";

export type MemoryApplyLogEntry = {
  id: string;
  userId: string;
  organizationId: string | null;
  channel: MemoryApplyChannel;
  mode: MemoryApplyMode;
  memoryIdsUsed: string[];
  scopesUsed: string[];
  artifactIds: string[];
  beforeText: string;
  afterText: string;
  beforeTokens: number;
  afterTokens: number;
  tokenDelta: number;
  quality: MemoryQualityDiff | null;
  improvementRate: number;
  appliedAt: string;
};

type LogBucket = {
  byUser: Map<string, MemoryApplyLogEntry[]>;
};

function getBucket(): LogBucket {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryApplyLog?: LogBucket;
  };
  if (!g.__atlasMemoryApplyLog) {
    g.__atlasMemoryApplyLog = { byUser: new Map() };
  }
  return g.__atlasMemoryApplyLog;
}

function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 2);
}

export function resetMemoryApplyLogForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryApplyLog?: LogBucket;
  };
  g.__atlasMemoryApplyLog = { byUser: new Map() };
}

export function appendMemoryApplyLog(input: {
  userId: string;
  organizationId?: string | null;
  channel: MemoryApplyChannel;
  mode: MemoryApplyMode;
  memoryIdsUsed?: string[];
  scopesUsed?: string[];
  artifactIds?: string[];
  beforeText: string;
  afterText: string;
  quality?: MemoryQualityDiff | null;
}): MemoryApplyLogEntry {
  const beforeTokens = estimateTokens(input.beforeText);
  const afterTokens = estimateTokens(input.afterText);
  const entry: MemoryApplyLogEntry = {
    id: `mal_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    channel: input.channel,
    mode: input.mode,
    memoryIdsUsed: input.memoryIdsUsed ?? [],
    scopesUsed: input.scopesUsed ?? [],
    artifactIds: input.artifactIds ?? [],
    beforeText: input.beforeText.slice(0, 4_000),
    afterText: input.afterText.slice(0, 4_000),
    beforeTokens,
    afterTokens,
    tokenDelta: afterTokens - beforeTokens,
    quality: input.quality ?? null,
    improvementRate: input.quality?.improvementRate ?? 0,
    appliedAt: new Date().toISOString(),
  };

  const bucket = getBucket();
  const list = bucket.byUser.get(input.userId) ?? [];
  list.push(entry);
  if (list.length > 1_000) list.splice(0, list.length - 1_000);
  bucket.byUser.set(input.userId, list);

  void persistDurableDomain(
    input.userId,
    MEMORY_APPLY_LOG_DOMAIN_KEY,
    { entries: list.slice(-200) },
    {
      compact: (payload: { entries: MemoryApplyLogEntry[] }) => ({
        entries: (payload.entries ?? []).slice(-100),
      }),
      forceSupabase: true,
    },
  ).catch(() => {
    // never block apply path
  });

  return entry;
}

export function listMemoryApplyLogs(
  userId: string,
  options?: { channel?: MemoryApplyChannel; limit?: number },
): MemoryApplyLogEntry[] {
  const list = getBucket().byUser.get(userId) ?? [];
  const filtered = options?.channel
    ? list.filter((e) => e.channel === options.channel)
    : list;
  const limit = options?.limit ?? 100;
  return [...filtered].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)).slice(0, limit);
}

export async function hydrateMemoryApplyLog(userId: string): Promise<void> {
  const loaded = await loadDurableDomain<{ entries: MemoryApplyLogEntry[] }>(
    userId,
    MEMORY_APPLY_LOG_DOMAIN_KEY,
  );
  if (!loaded?.entries?.length) return;
  const bucket = getBucket();
  const existing = bucket.byUser.get(userId) ?? [];
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const entry of loaded.entries) {
    byId.set(entry.id, entry);
  }
  bucket.byUser.set(userId, [...byId.values()]);
}

/** Side-by-side Memory OFF vs ON comparison report. */
export function buildMemoryOnOffComparison(input: {
  userId: string;
  channel: MemoryApplyChannel;
  offText: string;
  onText: string;
  qualityOn: MemoryQualityDiff;
}): {
  channel: MemoryApplyChannel;
  offPreview: string;
  onPreview: string;
  tokenDelta: number;
  improvementRate: number;
  verdict: "improved" | "neutral" | "regressed";
} {
  const tokenDelta =
    estimateTokens(input.onText) - estimateTokens(input.offText);
  const improvementRate = input.qualityOn.improvementRate;
  const verdict =
    improvementRate >= 0.45
      ? "improved"
      : improvementRate >= 0.25
        ? "neutral"
        : "regressed";
  return {
    channel: input.channel,
    offPreview: input.offText.slice(0, 500),
    onPreview: input.onText.slice(0, 500),
    tokenDelta,
    improvementRate,
    verdict,
  };
}
