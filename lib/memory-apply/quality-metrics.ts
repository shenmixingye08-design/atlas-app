/**
 * Production quality indicators for Memory.
 * Fail-open: never break generation if recording fails.
 */

import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { safeLog } from "@/lib/security/redact";

export const MEMORY_QUALITY_DOMAIN_KEY = "atlasMemoryQuality";

export type MemoryQualityEventType =
  | "memory_applied"
  | "memory_apply_failed"
  | "generation_approved"
  | "generation_regenerated"
  | "generation_edited"
  | "candidate_confirmed"
  | "candidate_rejected"
  | "forbidden_violation"
  | "duplicate_post";

export type MemoryQualityEvent = {
  id: string;
  userId: string;
  type: MemoryQualityEventType;
  channel: string;
  jobId?: string | null;
  batchId?: string | null;
  itemId?: string | null;
  diffRate?: number;
  editChars?: number;
  memoryApplied?: boolean;
  at: string;
};

export type MemoryQualityIndicators = {
  applyRate: number;
  approvalRate: number;
  regenerateRate: number;
  editRate: number;
  averageDiffRate: number;
  candidateConfirmRate: number;
  candidateRejectRate: number;
  postApplyEditChars: number;
  preApplyEditChars: number;
  forbiddenViolationCount: number;
  duplicatePostRate: number;
  sampleCount: number;
};

type Bucket = {
  byUser: Map<string, MemoryQualityEvent[]>;
};

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryQuality?: Bucket;
  };
  if (!g.__atlasMemoryQuality) {
    g.__atlasMemoryQuality = { byUser: new Map() };
  }
  return g.__atlasMemoryQuality;
}

export function resetMemoryQualityMetricsForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasMemoryQuality?: Bucket;
  };
  g.__atlasMemoryQuality = { byUser: new Map() };
}

export function recordMemoryQualityEvent(input: {
  userId: string;
  type: MemoryQualityEventType;
  channel: string;
  jobId?: string | null;
  batchId?: string | null;
  itemId?: string | null;
  diffRate?: number;
  editChars?: number;
  memoryApplied?: boolean;
}): MemoryQualityEvent | null {
  try {
    if (!input.userId.trim()) return null;
    const event: MemoryQualityEvent = {
      id: `mqe_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      jobId: input.jobId ?? null,
      batchId: input.batchId ?? null,
      itemId: input.itemId ?? null,
      diffRate: input.diffRate,
      editChars: input.editChars,
      memoryApplied: input.memoryApplied,
      at: new Date().toISOString(),
    };
    const bucket = getBucket();
    const list = bucket.byUser.get(input.userId) ?? [];
    list.push(event);
    if (list.length > 1_000) list.splice(0, list.length - 1_000);
    bucket.byUser.set(input.userId, list);
    void persistDurableDomain(
      input.userId,
      MEMORY_QUALITY_DOMAIN_KEY,
      { events: list.slice(-200) },
      {
        compact: (payload: { events: MemoryQualityEvent[] }) => ({
          events: (payload.events ?? []).slice(-100),
        }),
        forceSupabase: true,
      },
    ).catch(() => undefined);
    return event;
  } catch (error) {
    safeLog("warn", "[memory-quality] record failed", {
      errorName: error instanceof Error ? error.name : "Error",
    });
    return null;
  }
}

export function getMemoryQualityIndicators(
  userId: string,
): MemoryQualityIndicators {
  const events = getBucket().byUser.get(userId) ?? [];
  const generations = events.filter((e) =>
    e.type === "memory_applied" ||
    e.type === "memory_apply_failed" ||
    e.type === "generation_approved" ||
    e.type === "generation_regenerated" ||
    e.type === "generation_edited",
  );
  const applyEvents = events.filter(
    (e) => e.type === "memory_applied" || e.type === "memory_apply_failed",
  );
  const applied = applyEvents.filter((e) => e.type === "memory_applied").length;
  const approved = events.filter((e) => e.type === "generation_approved").length;
  const regenerated = events.filter((e) => e.type === "generation_regenerated").length;
  const edited = events.filter((e) => e.type === "generation_edited").length;
  const confirmed = events.filter((e) => e.type === "candidate_confirmed").length;
  const rejected = events.filter((e) => e.type === "candidate_rejected").length;
  const candidateDecisions = confirmed + rejected;
  const diffs = events
    .map((e) => e.diffRate)
    .filter((value): value is number => typeof value === "number");
  const postApply = events
    .filter((e) => e.memoryApplied && typeof e.editChars === "number")
    .reduce((sum, e) => sum + (e.editChars ?? 0), 0);
  const preApply = events
    .filter((e) => e.memoryApplied === false && typeof e.editChars === "number")
    .reduce((sum, e) => sum + (e.editChars ?? 0), 0);
  const forbidden = events.filter((e) => e.type === "forbidden_violation").length;
  const duplicates = events.filter((e) => e.type === "duplicate_post").length;
  const denom = Math.max(generations.length, 1);
  const applyDenom = Math.max(applyEvents.length, 1);

  return {
    applyRate: Number((applied / applyDenom).toFixed(4)),
    approvalRate: Number((approved / denom).toFixed(4)),
    regenerateRate: Number((regenerated / denom).toFixed(4)),
    editRate: Number((edited / denom).toFixed(4)),
    averageDiffRate:
      diffs.length > 0
        ? Number((diffs.reduce((sum, n) => sum + n, 0) / diffs.length).toFixed(4))
        : 0,
    candidateConfirmRate:
      candidateDecisions > 0
        ? Number((confirmed / candidateDecisions).toFixed(4))
        : 0,
    candidateRejectRate:
      candidateDecisions > 0
        ? Number((rejected / candidateDecisions).toFixed(4))
        : 0,
    postApplyEditChars: postApply,
    preApplyEditChars: preApply,
    forbiddenViolationCount: forbidden,
    duplicatePostRate: Number((duplicates / denom).toFixed(4)),
    sampleCount: events.length,
  };
}

export async function hydrateMemoryQuality(userId: string): Promise<void> {
  try {
    const loaded = await loadDurableDomain<{ events: MemoryQualityEvent[] }>(
      userId,
      MEMORY_QUALITY_DOMAIN_KEY,
    );
    if (!loaded?.events?.length) return;
    const bucket = getBucket();
    const existing = bucket.byUser.get(userId) ?? [];
    const byId = new Map(existing.map((e) => [e.id, e]));
    for (const event of loaded.events) {
      if (event.userId === userId) byId.set(event.id, event);
    }
    bucket.byUser.set(userId, [...byId.values()]);
  } catch {
    // fail-open
  }
}
