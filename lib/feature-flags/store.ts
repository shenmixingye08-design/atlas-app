import { FEATURE_FLAG_IDS } from "./registry";
import {
  isAutomationFirstRolloutFlag,
  resolveAutomationFirstDefaultState,
} from "./rollout";
import type { FeatureFlagId, FeatureFlagRecord, FeatureFlagState } from "./types";

type FlagBucket = Map<FeatureFlagId, FeatureFlagRecord>;

const DEFAULT_STATE: FeatureFlagState = "on";

/**
 * Platform flags that stay OFF until separately rolled out.
 * Automation First formal-home flags use `resolveAutomationFirstDefaultState()`.
 *
 * `automation_memory_enabled` is Production-ON (N-05 proven): see defaultStateFor.
 */
const DEFAULT_STATE_BY_ID: Partial<Record<FeatureFlagId, FeatureFlagState>> = {
  automation_approval_enabled: "off",
  workflow_learning_enabled: "off",
  // N-01: media generation engines are not Production-ready — never default ON.
  video_generation: "off",
  image_generation: "off",
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStateFor(id: FeatureFlagId): FeatureFlagState {
  if (isAutomationFirstRolloutFlag(id)) {
    return resolveAutomationFirstDefaultState();
  }
  // Automation Memory: ON outside Vitest so Production create with
  // memoryPolicy.enabled does not 503 (unattended gate / paid users).
  if (id === "automation_memory_enabled") {
    if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
      return "off";
    }
    return "on";
  }
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
