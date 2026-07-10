import { FEATURE_FLAG_IDS } from "./registry";
import type { FeatureFlagId, FeatureFlagRecord, FeatureFlagState } from "./types";

type FlagBucket = Map<FeatureFlagId, FeatureFlagRecord>;

const DEFAULT_STATE: FeatureFlagState = "on";

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultRecord(id: FeatureFlagId): FeatureFlagRecord {
  const timestamp = nowIso();
  return { id, state: DEFAULT_STATE, updatedAt: timestamp };
}

function getBucket(): FlagBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasFeatureFlagStore?: FlagBucket;
  };

  if (!globalScope.__atlasFeatureFlagStore) {
    const initial = new Map<FeatureFlagId, FeatureFlagRecord>();
    for (const id of FEATURE_FLAG_IDS) {
      initial.set(id, createDefaultRecord(id));
    }
    globalScope.__atlasFeatureFlagStore = initial;
  }

  return globalScope.__atlasFeatureFlagStore;
}

export function listFeatureFlagRecords(): FeatureFlagRecord[] {
  return FEATURE_FLAG_IDS.map(
    (id) => getBucket().get(id) ?? createDefaultRecord(id),
  );
}

export function getFeatureFlagRecord(id: FeatureFlagId): FeatureFlagRecord {
  return getBucket().get(id) ?? createDefaultRecord(id);
}

export function getFeatureFlagState(id: FeatureFlagId): FeatureFlagState {
  return getFeatureFlagRecord(id).state;
}

export function setFeatureFlagState(
  id: FeatureFlagId,
  state: FeatureFlagState,
): FeatureFlagRecord {
  const record: FeatureFlagRecord = {
    id,
    state,
    updatedAt: nowIso(),
  };
  getBucket().set(id, record);
  return record;
}

export function resetFeatureFlagStore(): void {
  getBucket().clear();
  for (const id of FEATURE_FLAG_IDS) {
    getBucket().set(id, createDefaultRecord(id));
  }
}
