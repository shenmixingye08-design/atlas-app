import "server-only";

import {
  replaceRuntimeBetaStore,
  snapshotRuntimeBetaStore,
} from "./emails";
import {
  loadOwnerRuntimeDomain,
  saveOwnerRuntimeDomain,
} from "@/lib/owner/runtime-config/durable-state";

export const BETA_RUNTIME_DOMAIN = "atlasBetaUserRuntime";

export type BetaRuntimeDurablePayload = {
  version: 1;
  added: string[];
  removed: string[];
};

type HydrateState = "pending" | "ready" | "failed";

const globalScope = globalThis as typeof globalThis & {
  __atlasBetaRuntimeHydrate?: HydrateState;
  __atlasBetaRuntimeHydratePromise?: Promise<boolean>;
};

export function didBetaRuntimeHydrateFail(): boolean {
  return (globalScope.__atlasBetaRuntimeHydrate ?? "pending") === "failed";
}

export function resetBetaRuntimeDurableForTests(): void {
  globalScope.__atlasBetaRuntimeHydrate = "pending";
  globalScope.__atlasBetaRuntimeHydratePromise = undefined;
}

export async function persistBetaRuntimeNow(): Promise<boolean> {
  const snapshot = snapshotRuntimeBetaStore();
  const ok = await saveOwnerRuntimeDomain(BETA_RUNTIME_DOMAIN, {
    version: 1,
    ...snapshot,
  } satisfies BetaRuntimeDurablePayload);
  if (ok) globalScope.__atlasBetaRuntimeHydrate = "ready";
  return ok;
}

export async function ensureBetaRuntimeHydrated(): Promise<boolean> {
  if (globalScope.__atlasBetaRuntimeHydrate === "ready") return true;
  if (globalScope.__atlasBetaRuntimeHydratePromise) {
    return globalScope.__atlasBetaRuntimeHydratePromise;
  }

  globalScope.__atlasBetaRuntimeHydratePromise = (async () => {
    const loaded = await loadOwnerRuntimeDomain<BetaRuntimeDurablePayload>(
      BETA_RUNTIME_DOMAIN,
    );
    if (loaded.status === "unavailable" || loaded.status === "missing") {
      globalScope.__atlasBetaRuntimeHydrate = "ready";
      return true;
    }
    if (loaded.status === "failed") {
      console.warn("[beta-users] durable hydrate failed:", loaded.message);
      globalScope.__atlasBetaRuntimeHydrate = "failed";
      return false;
    }
    if (loaded.payload?.version === 1) {
      replaceRuntimeBetaStore({
        added: Array.isArray(loaded.payload.added) ? loaded.payload.added : [],
        removed: Array.isArray(loaded.payload.removed)
          ? loaded.payload.removed
          : [],
      });
    }
    globalScope.__atlasBetaRuntimeHydrate = "ready";
    return true;
  })();

  try {
    return await globalScope.__atlasBetaRuntimeHydratePromise;
  } finally {
    globalScope.__atlasBetaRuntimeHydratePromise = undefined;
  }
}
