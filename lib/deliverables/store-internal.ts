import "server-only";

import type { StoredDeliverable } from "./store";

type StoreBucket = Map<string, StoredDeliverable>;

/** Internal bucket accessor for artifact-persist (avoids circular import cycles). */
export function getStoreBucketForArtifact(): StoreBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableStore?: StoreBucket;
  };
  if (!globalScope.__atlasDeliverableStore) {
    globalScope.__atlasDeliverableStore = new Map();
  }
  return globalScope.__atlasDeliverableStore;
}
