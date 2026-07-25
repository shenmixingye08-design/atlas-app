import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import {
  isHierarchicalMemoryHydrated,
  listStoredHierarchicalMemories,
  markHierarchicalMemoryHydrated,
  replaceStoredHierarchicalMemories,
} from "./store";
import type { HierarchicalMemoryRecord } from "./types";

export const HIERARCHICAL_MEMORY_DOMAIN_KEY = "atlasHierarchicalMemory";

export type DurableHierarchicalMemoryState = {
  memories: HierarchicalMemoryRecord[];
};

const MAX_CLERK = 40;

function compact(
  state: DurableHierarchicalMemoryState,
): DurableHierarchicalMemoryState {
  return {
    memories: state.memories.slice(0, MAX_CLERK).map((memory) => ({
      ...memory,
      value: memory.value.slice(0, 400),
    })),
  };
}

export function snapshotHierarchicalMemory(
  userId: string,
): DurableHierarchicalMemoryState {
  return { memories: listStoredHierarchicalMemories(userId) };
}

export function schedulePersistHierarchicalMemory(userId: string): void {
  void persistDurableDomain(
    userId,
    HIERARCHICAL_MEMORY_DOMAIN_KEY,
    snapshotHierarchicalMemory(userId),
    { compact, forceSupabase: true },
  );
}

export async function ensureHierarchicalMemoryHydrated(
  userId: string,
): Promise<void> {
  if (isHierarchicalMemoryHydrated(userId)) return;
  const loaded = await loadDurableDomain<DurableHierarchicalMemoryState>(
    userId,
    HIERARCHICAL_MEMORY_DOMAIN_KEY,
  );
  if (loaded?.memories) {
    replaceStoredHierarchicalMemories(userId, loaded.memories);
  }
  markHierarchicalMemoryHydrated(userId);
}
