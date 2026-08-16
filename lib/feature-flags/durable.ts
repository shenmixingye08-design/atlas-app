import "server-only";

import { isFeatureFlagId } from "./registry";
import {
  listFeatureFlagRecords,
  replaceFeatureFlagStates,
} from "./store";
import type { FeatureFlagId, FeatureFlagRecord, FeatureFlagState } from "./types";
import {
  loadOwnerRuntimeDomain,
  saveOwnerRuntimeDomain,
} from "@/lib/owner/runtime-config/durable-state";

export const FEATURE_FLAGS_DOMAIN = "atlasFeatureFlags";

export type FeatureFlagsDurablePayload = {
  version: 1;
  flags: FeatureFlagRecord[];
};

type HydrateState = "pending" | "ready" | "failed";

const globalScope = globalThis as typeof globalThis & {
  __atlasFeatureFlagHydrate?: HydrateState;
  __atlasFeatureFlagHydratePromise?: Promise<boolean>;
};

function getHydrateState(): HydrateState {
  return globalScope.__atlasFeatureFlagHydrate ?? "pending";
}

export function isFeatureFlagStoreHydrated(): boolean {
  return getHydrateState() === "ready";
}

export function didFeatureFlagHydrateFail(): boolean {
  return getHydrateState() === "failed";
}

export function resetFeatureFlagDurableForTests(): void {
  globalScope.__atlasFeatureFlagHydrate = "pending";
  globalScope.__atlasFeatureFlagHydratePromise = undefined;
}

function applyPayload(payload: FeatureFlagsDurablePayload): void {
  const records = payload.flags.filter(
    (row): row is FeatureFlagRecord =>
      Boolean(row) &&
      isFeatureFlagId(row.id) &&
      (row.state === "on" || row.state === "off" || row.state === "beta") &&
      typeof row.updatedAt === "string",
  );
  replaceFeatureFlagStates(records);
}

export async function persistFeatureFlagsNow(): Promise<boolean> {
  const payload: FeatureFlagsDurablePayload = {
    version: 1,
    flags: listFeatureFlagRecords(),
  };
  const ok = await saveOwnerRuntimeDomain(FEATURE_FLAGS_DOMAIN, payload);
  if (ok) globalScope.__atlasFeatureFlagHydrate = "ready";
  return ok;
}

export async function ensureFeatureFlagsHydrated(): Promise<boolean> {
  if (getHydrateState() === "ready") return true;
  if (globalScope.__atlasFeatureFlagHydratePromise) {
    return globalScope.__atlasFeatureFlagHydratePromise;
  }

  globalScope.__atlasFeatureFlagHydratePromise = (async () => {
    const loaded = await loadOwnerRuntimeDomain<FeatureFlagsDurablePayload>(
      FEATURE_FLAGS_DOMAIN,
    );
    if (loaded.status === "unavailable" || loaded.status === "missing") {
      globalScope.__atlasFeatureFlagHydrate = "ready";
      return true;
    }
    if (loaded.status === "failed") {
      console.warn("[feature-flags] durable hydrate failed:", loaded.message);
      globalScope.__atlasFeatureFlagHydrate = "failed";
      return false;
    }
    if (loaded.payload?.version === 1 && Array.isArray(loaded.payload.flags)) {
      applyPayload(loaded.payload);
    }
    globalScope.__atlasFeatureFlagHydrate = "ready";
    return true;
  })();

  try {
    return await globalScope.__atlasFeatureFlagHydratePromise;
  } finally {
    globalScope.__atlasFeatureFlagHydratePromise = undefined;
  }
}

export function isFeatureFlagState(value: unknown): value is FeatureFlagState {
  return value === "on" || value === "off" || value === "beta";
}

export function isFeatureFlagRecordId(value: unknown): value is FeatureFlagId {
  return typeof value === "string" && isFeatureFlagId(value);
}
