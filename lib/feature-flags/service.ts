import "server-only";

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

  return { flags, updatedAt };
}

export function updateFeatureFlagState(
  id: FeatureFlagId,
  state: FeatureFlagState,
): FeatureFlagSnapshot {
  getFeatureFlagDefinition(id);
  setFeatureFlagState(id, state);
  return getFeatureFlagSnapshot();
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
