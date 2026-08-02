import { FEATURE_FLAG_IDS } from "./registry";
import type { FeatureFlagId, FeatureFlagRecord, FeatureFlagState } from "./types";

type FlagBucket = Map<FeatureFlagId, FeatureFlagRecord>;

const DEFAULT_STATE: FeatureFlagState = "on";

/** New platform flags default OFF so production stays on V1 until rollout. */
const DEFAULT_STATE_BY_ID: Partial<Record<FeatureFlagId, FeatureFlagState>> = {
  automation_v2_enabled: "off",
  automation_memory_enabled: "off",
  automation_approval_enabled: "off",
  automation_first_home_enabled: "off",
  automation_first_navigation_enabled: "off",
  automation_design_system_enabled: "off",
  automation_dashboard_v2_enabled: "off",
  workflow_learning_enabled: "off",
  automation_operations_enabled: "off",
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStateFor(id: FeatureFlagId): FeatureFlagState {
  return DEFAULT_STATE_BY_ID[id] ?? DEFAULT_STATE;
}

function createDefaultRecord(id: FeatureFlagId): FeatureFlagRecord {
  const timestamp = nowIso();
  return { id, state: defaultStateFor(id), updatedAt: timestamp };
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
