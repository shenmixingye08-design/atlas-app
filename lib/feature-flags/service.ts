import "server-only";

import {
  getOwnerRuntimePersistMode,
  ownerRuntimeMutationBlockedMessage,
} from "@/lib/owner/runtime-config/persist-mode";

import {
  didFeatureFlagHydrateFail,
  ensureFeatureFlagsHydrated,
  persistFeatureFlagsNow,
} from "./durable";
import { getFeatureFlagDefinition, isFeatureFlagId } from "./registry";
import {
  getFeatureFlagRecord,
  listFeatureFlagRecords,
  setFeatureFlagState,
} from "./store";
import type {
  FeatureFlagId,
  FeatureFlagSnapshot,
  FeatureFlagState,
} from "./types";

export function getFeatureFlagSnapshot(): FeatureFlagSnapshot {
  const flags = listFeatureFlagRecords();
  const updatedAt = flags.reduce(
    (latest, record) =>
      record.updatedAt > latest ? record.updatedAt : latest,
    flags[0]?.updatedAt ?? new Date().toISOString(),
  );
  const persistMode = getOwnerRuntimePersistMode();

  return {
    flags,
    updatedAt,
    persistMode,
    mutable: persistMode !== "blocked" && !didFeatureFlagHydrateFail(),
    hydrateFailed: didFeatureFlagHydrateFail(),
  };
}

export function updateFeatureFlagState(
  id: FeatureFlagId,
  state: FeatureFlagState,
): FeatureFlagSnapshot {
  getFeatureFlagDefinition(id);
  setFeatureFlagState(id, state);
  return getFeatureFlagSnapshot();
}

export async function getFeatureFlagSnapshotForOwner(): Promise<FeatureFlagSnapshot> {
  await ensureFeatureFlagsHydrated();
  return getFeatureFlagSnapshot();
}

export async function updateFeatureFlagStateForOwner(
  id: FeatureFlagId,
  state: FeatureFlagState,
): Promise<{ snapshot: FeatureFlagSnapshot } | { error: string; status: number }> {
  const persistMode = getOwnerRuntimePersistMode();
  if (persistMode === "blocked") {
    return { error: ownerRuntimeMutationBlockedMessage(), status: 503 };
  }

  const hydrated = await ensureFeatureFlagsHydrated();
  if (!hydrated) {
    return {
      error: "設定の読み込みに失敗したため、変更を保存できません。",
      status: 503,
    };
  }

  getFeatureFlagDefinition(id);
  const previous = getFeatureFlagRecord(id);
  updateFeatureFlagState(id, state);

  if (persistMode === "durable") {
    const saved = await persistFeatureFlagsNow();
    if (!saved) {
      setFeatureFlagState(id, previous.state);
      return {
        error: "保存に失敗したため、変更は反映していません。",
        status: 503,
      };
    }
  }

  return { snapshot: getFeatureFlagSnapshot() };
}

export function parseFeatureFlagUpdateBody(body: unknown):
  | { id: FeatureFlagId; state: FeatureFlagState }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as { id?: unknown; state?: unknown };

  if (typeof record.id !== "string" || !isFeatureFlagId(record.id)) {
    return { error: "id is invalid" };
  }

  if (record.state !== "on" && record.state !== "off" && record.state !== "beta") {
    return { error: "state must be on, off, or beta" };
  }

  return { id: record.id, state: record.state };
}

export function getOwnerFeatureFlagRows() {
  return getFeatureFlagSnapshot().flags.map((record) => ({
    ...record,
    ...getFeatureFlagDefinition(record.id),
  }));
}
