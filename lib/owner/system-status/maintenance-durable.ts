import "server-only";

import {
  getMaintenanceModeConfig,
  replaceMaintenanceModeConfig,
  type MaintenanceModeConfig,
} from "./maintenance";
import {
  loadOwnerRuntimeDomain,
  saveOwnerRuntimeDomain,
} from "@/lib/owner/runtime-config/durable-state";

export const MAINTENANCE_DOMAIN = "atlasMaintenanceMode";

type HydrateState = "pending" | "ready" | "failed";

const globalScope = globalThis as typeof globalThis & {
  __atlasMaintenanceHydrate?: HydrateState;
  __atlasMaintenanceHydratePromise?: Promise<boolean>;
};

function isMaintenanceConfig(value: unknown): value is MaintenanceModeConfig {
  if (!value || typeof value !== "object") return false;
  const row = value as MaintenanceModeConfig;
  return (
    typeof row.enabled === "boolean" &&
    typeof row.message === "string" &&
    typeof row.announcement === "string" &&
    typeof row.updatedAt === "string" &&
    (row.estimatedRecoveryAt === null ||
      typeof row.estimatedRecoveryAt === "string")
  );
}

export function didMaintenanceHydrateFail(): boolean {
  return (globalScope.__atlasMaintenanceHydrate ?? "pending") === "failed";
}

export function resetMaintenanceDurableForTests(): void {
  globalScope.__atlasMaintenanceHydrate = "pending";
  globalScope.__atlasMaintenanceHydratePromise = undefined;
}

export async function persistMaintenanceNow(): Promise<boolean> {
  const ok = await saveOwnerRuntimeDomain(
    MAINTENANCE_DOMAIN,
    getMaintenanceModeConfig(),
  );
  if (ok) globalScope.__atlasMaintenanceHydrate = "ready";
  return ok;
}

export async function ensureMaintenanceHydrated(): Promise<boolean> {
  if (globalScope.__atlasMaintenanceHydrate === "ready") return true;
  if (globalScope.__atlasMaintenanceHydratePromise) {
    return globalScope.__atlasMaintenanceHydratePromise;
  }

  globalScope.__atlasMaintenanceHydratePromise = (async () => {
    const loaded = await loadOwnerRuntimeDomain<MaintenanceModeConfig>(
      MAINTENANCE_DOMAIN,
    );
    if (loaded.status === "unavailable" || loaded.status === "missing") {
      globalScope.__atlasMaintenanceHydrate = "ready";
      return true;
    }
    if (loaded.status === "failed") {
      console.warn("[maintenance] durable hydrate failed:", loaded.message);
      globalScope.__atlasMaintenanceHydrate = "failed";
      return false;
    }
    if (isMaintenanceConfig(loaded.payload)) {
      replaceMaintenanceModeConfig(loaded.payload);
    }
    globalScope.__atlasMaintenanceHydrate = "ready";
    return true;
  })();

  try {
    return await globalScope.__atlasMaintenanceHydratePromise;
  } finally {
    globalScope.__atlasMaintenanceHydratePromise = undefined;
  }
}
