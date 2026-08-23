import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";

import type {
  WorkMemoryCandidate,
  WorkMemoryRecord,
  WorkMemorySettings,
} from "./types";
import {
  listStoredCandidates,
  listStoredWorkMemories,
  readWorkMemorySettings,
  replaceStoredCandidates,
  replaceStoredWorkMemories,
  writeWorkMemorySettings,
  isWorkMemoryHydrated,
  markWorkMemoryHydrated,
  getRequestHistorySnapshot,
  replaceRequestHistory,
} from "./store";

export const WORK_MEMORY_DOMAIN_KEY = "atlasWorkMemory";

export type DurableWorkMemoryState = {
  memories: WorkMemoryRecord[];
  candidates: WorkMemoryCandidate[];
  settings: WorkMemorySettings;
  requestHistory: Array<{
    fingerprint: string;
    count: number;
    lastAssignment: string;
    lastAt: string;
  }>;
};

const MAX_CLERK_MEMORIES = 25;
const MAX_CLERK_CANDIDATES = 20;

function compactWorkMemory(state: DurableWorkMemoryState): DurableWorkMemoryState {
  return {
    settings: state.settings,
    requestHistory: state.requestHistory.slice(0, 40).map((entry) => ({
      ...entry,
      lastAssignment: entry.lastAssignment.slice(0, 160),
    })),
    candidates: state.candidates.slice(0, MAX_CLERK_CANDIDATES).map((c) => ({
      ...c,
      summary: c.summary.slice(0, 240),
      structuredData: {},
      reason: c.reason.slice(0, 160),
    })),
    memories: state.memories.slice(0, MAX_CLERK_MEMORIES).map((m) => ({
      ...m,
      summary: m.summary.slice(0, 240),
      structuredData: {},
    })),
  };
}

export function snapshotWorkMemory(userId: string): DurableWorkMemoryState {
  return {
    memories: listStoredWorkMemories(userId),
    candidates: listStoredCandidates(userId),
    settings: readWorkMemorySettings(userId),
    requestHistory: getRequestHistorySnapshot(userId),
  };
}

export function schedulePersistWorkMemory(userId: string): void {
  bumpPersistenceCounter("workMemoryPersist");
  void persistDurableDomain(
    userId,
    WORK_MEMORY_DOMAIN_KEY,
    snapshotWorkMemory(userId),
    { compact: compactWorkMemory, forceSupabase: true },
  );
}

export async function persistWorkMemoryNow(userId: string): Promise<void> {
  bumpPersistenceCounter("workMemoryPersist");
  await persistDurableDomain(
    userId,
    WORK_MEMORY_DOMAIN_KEY,
    snapshotWorkMemory(userId),
    { compact: compactWorkMemory, forceSupabase: true },
  );
}

export type WorkMemoryHydrationResult =
  | { ok: true }
  | { ok: false; developerCode: "hydration_failed" };

export class WorkMemoryHydrationError extends Error {
  readonly developerCode = "hydration_failed" as const;

  constructor(message = "Work Memoryの読み込みに失敗しました") {
    super(message);
    this.name = "WorkMemoryHydrationError";
  }
}

export async function ensureWorkMemoryHydrated(
  userId: string,
): Promise<WorkMemoryHydrationResult> {
  if (isWorkMemoryHydrated(userId)) return { ok: true };

  try {
    const loaded = await loadDurableDomain<DurableWorkMemoryState>(
      userId,
      WORK_MEMORY_DOMAIN_KEY,
    );
    if (!loaded) {
      markWorkMemoryHydrated(userId);
      return { ok: true };
    }

    if (
      Array.isArray(loaded.memories) &&
      listStoredWorkMemories(userId).length === 0
    ) {
      replaceStoredWorkMemories(
        userId,
        loaded.memories.filter((row) => row.userId === userId),
      );
    }
    if (
      Array.isArray(loaded.candidates) &&
      listStoredCandidates(userId).length === 0
    ) {
      replaceStoredCandidates(
        userId,
        loaded.candidates.filter((row) => row.userId === userId),
      );
    }
    if (loaded.settings) {
      writeWorkMemorySettings(userId, loaded.settings);
    }
    if (Array.isArray(loaded.requestHistory)) {
      replaceRequestHistory(userId, loaded.requestHistory);
    }
    markWorkMemoryHydrated(userId);
    return { ok: true };
  } catch (error) {
    console.warn(
      "[work-memory] Hydration failed:",
      error instanceof Error ? error.message : "hydration_failed",
    );
    return { ok: false, developerCode: "hydration_failed" };
  }
}
