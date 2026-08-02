import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import type {
  GenerationApplicationRecord,
  PredictionRecord,
  ProductionMemoryRecord,
} from "@/lib/personalization/types";
import {
  restoreProductionMemorySnapshot,
  snapshotProductionMemory,
} from "@/lib/personalization/store";

export const PRODUCTION_MEMORY_DOMAIN_KEY = "atlasProductionMemory";

export type DurableProductionMemoryState = {
  memories: ProductionMemoryRecord[];
  generations: GenerationApplicationRecord[];
  predictions: PredictionRecord[];
};

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const globalScope = globalThis as typeof globalThis & {
    __atlasProductionMemoryHydrated?: HydrationFlags;
  };
  if (!globalScope.__atlasProductionMemoryHydrated) {
    globalScope.__atlasProductionMemoryHydrated = new Set();
  }
  return globalScope.__atlasProductionMemoryHydrated;
}

export function resetProductionMemoryDurableForTests(): void {
  getHydrated().clear();
}

function compact(
  state: DurableProductionMemoryState,
): DurableProductionMemoryState {
  return {
    memories: state.memories.slice(0, 400).map((row) => ({
      ...row,
      summary: row.summary.slice(0, 240),
      title: row.title.slice(0, 120),
      // Never persist raw document bodies as memory values
      normalizedValue: sanitizeValue(row.normalizedValue),
    })),
    generations: state.generations.slice(0, 300),
    predictions: state.predictions.slice(0, 200),
  };
}

function sanitizeValue(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const blocked = new Set([
    "password",
    "apiKey",
    "api_key",
    "accessToken",
    "refreshToken",
    "secret",
    "token",
    "authorization",
    "rawDocument",
    "fullText",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (typeof val === "string" && val.length > 500) {
      out[key] = `${val.slice(0, 500)}…`;
      continue;
    }
    out[key] = val;
  }
  return out;
}

export function schedulePersistProductionMemory(ownerId: string): void {
  void persistDurableDomain(
    ownerId,
    PRODUCTION_MEMORY_DOMAIN_KEY,
    snapshotProductionMemory(ownerId),
    { compact, forceSupabase: true },
  );
}

export async function ensureProductionMemoryHydrated(
  ownerId: string,
): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(ownerId)) return;
  const loaded = await loadDurableDomain<DurableProductionMemoryState>(
    ownerId,
    PRODUCTION_MEMORY_DOMAIN_KEY,
  );
  if (loaded) {
    restoreProductionMemorySnapshot(ownerId, loaded);
  }
  hydrated.add(ownerId);
}

export async function wipeProductionMemoryDurable(
  ownerId: string,
): Promise<void> {
  restoreProductionMemorySnapshot(ownerId, {
    memories: [],
    generations: [],
    predictions: [],
  });
  await persistDurableDomain(
    ownerId,
    PRODUCTION_MEMORY_DOMAIN_KEY,
    snapshotProductionMemory(ownerId),
    { compact, forceSupabase: true },
  );
  getHydrated().add(ownerId);
}
