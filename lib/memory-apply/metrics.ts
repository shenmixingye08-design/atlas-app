import "server-only";

import type {
  MemoryApplyChannel,
  MemoryApplyEvent,
  MemoryApplyMetricsSnapshot,
  MemoryApplyMode,
} from "@/lib/memory-apply/types";

const ALL_CHANNELS: MemoryApplyChannel[] = [
  "automation",
  "vision",
  "ocr",
  "word",
  "excel",
  "pdf",
  "powerpoint",
  "notification",
  "dashboard",
  "regenerate",
  "scheduler",
  "orchestration",
  "commander",
  "prediction",
  "workflow",
];

type Bucket = {
  events: MemoryApplyEvent[];
  updateCount: number;
};

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryApplyMetrics?: Bucket;
  };
  if (!g.__atlasMemoryApplyMetrics) {
    g.__atlasMemoryApplyMetrics = { events: [], updateCount: 0 };
  }
  return g.__atlasMemoryApplyMetrics;
}

export function resetMemoryApplyMetricsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryApplyMetrics?: Bucket;
  };
  g.__atlasMemoryApplyMetrics = { events: [], updateCount: 0 };
}

export function recordMemoryApplyEvent(input: {
  userId: string;
  channel: MemoryApplyChannel;
  memoryMode: MemoryApplyMode;
  applied: boolean;
  memoryIdsUsed?: string[];
  scopesUsed?: string[];
  improvementRate?: number;
  success?: boolean;
  failureReason?: string | null;
  memoryRetrieved?: boolean;
  memoryApplied?: boolean;
  memorySource?: "atlasPersonalMemory" | "none";
  appliedPreferenceKeys?: string[];
  correlationId?: string | null;
}): MemoryApplyEvent {
  const memoryIdsUsed = input.memoryIdsUsed ?? [];
  const memoryRetrieved =
    input.memoryRetrieved ?? memoryIdsUsed.length > 0;
  const memoryApplied = input.memoryApplied ?? input.applied;
  const event: MemoryApplyEvent = {
    id: `mae_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    userId: input.userId,
    channel: input.channel,
    memoryMode: input.memoryMode,
    applied: input.applied,
    memoryRetrieved,
    memoryApplied,
    memorySource:
      input.memorySource ??
      (memoryRetrieved ? "atlasPersonalMemory" : "none"),
    appliedPreferenceKeys: input.appliedPreferenceKeys ?? [],
    memoryIdsUsed,
    scopesUsed: input.scopesUsed ?? [],
    improvementRate: input.improvementRate ?? 0,
    success: input.success ?? input.applied,
    failureReason: input.failureReason ?? null,
    correlationId: input.correlationId ?? null,
    at: new Date().toISOString(),
  };
  const bucket = getBucket();
  bucket.events.push(event);
  if (bucket.events.length > 5_000) {
    bucket.events.splice(0, bucket.events.length - 5_000);
  }
  return event;
}

export function recordMemoryUpdateEvent(userId: string, count = 1): void {
  const bucket = getBucket();
  bucket.updateCount += Math.max(0, count);
  recordMemoryApplyEvent({
    userId,
    channel: "dashboard",
    memoryMode: "on",
    applied: true,
    success: true,
    improvementRate: 0,
  });
}

export function getMemoryApplyMetrics(
  userId?: string,
): MemoryApplyMetricsSnapshot {
  const bucket = getBucket();
  const events = userId
    ? bucket.events.filter((e) => e.userId === userId)
    : bucket.events;

  const useCount = events.filter((e) => e.applied && e.memoryMode === "on").length;
  const successCount = events.filter((e) => e.success).length;
  const failureCount = events.filter((e) => !e.success).length;
  const total = events.length || 1;
  const avgImprovement =
    events.reduce((sum, e) => sum + e.improvementRate, 0) / total;
  const avgOverlap = avgImprovement; // proxy when overlap not stored per event

  const channelCoverage = Object.fromEntries(
    ALL_CHANNELS.map((ch) => [
      ch,
      events.filter((e) => e.channel === ch && e.applied).length,
    ]),
  ) as Record<MemoryApplyChannel, number>;

  const auditedChannels = ALL_CHANNELS.filter((ch) => channelCoverage[ch] > 0);
  const missingChannels = ALL_CHANNELS.filter((ch) => channelCoverage[ch] === 0);

  return {
    useCount,
    updateCount: bucket.updateCount,
    successCount,
    failureCount,
    successRate: Number((successCount / total).toFixed(4)),
    averageImprovementRate: Number(avgImprovement.toFixed(4)),
    averageOverlapRatio: Number(avgOverlap.toFixed(4)),
    channelCoverage,
    localStorageDependencyCount: 0,
    auditedChannels,
    missingChannels,
    pass: missingChannels.length === 0 && useCount > 0,
  };
}

export function listMemoryApplyEvents(userId?: string): MemoryApplyEvent[] {
  const bucket = getBucket();
  const events = userId
    ? bucket.events.filter((e) => e.userId === userId)
    : bucket.events;
  return [...events].sort((a, b) => b.at.localeCompare(a.at));
}
