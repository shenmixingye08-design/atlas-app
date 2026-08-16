import "server-only";

import {
  getOwnerRuntimePersistMode,
  ownerRuntimeMutationBlockedMessage,
} from "@/lib/owner/runtime-config/persist-mode";

import {
  didMaintenanceHydrateFail,
  ensureMaintenanceHydrated,
  persistMaintenanceNow,
} from "./maintenance-durable";
import {
  getMaintenanceModeConfig,
  setMaintenanceModeConfig,
  type MaintenanceModeConfig,
} from "./maintenance";

export async function getMaintenanceModeConfigForOwner(): Promise<
  MaintenanceModeConfig & {
    persistMode: ReturnType<typeof getOwnerRuntimePersistMode>;
    mutable: boolean;
    hydrateFailed: boolean;
  }
> {
  await ensureMaintenanceHydrated();
  const persistMode = getOwnerRuntimePersistMode();
  return {
    ...getMaintenanceModeConfig(),
    persistMode,
    mutable: persistMode !== "blocked" && !didMaintenanceHydrateFail(),
    hydrateFailed: didMaintenanceHydrateFail(),
  };
}

export async function updateMaintenanceModeForOwner(
  patch: Partial<Omit<MaintenanceModeConfig, "updatedAt">>,
): Promise<
  | {
      config: MaintenanceModeConfig & {
        persistMode: ReturnType<typeof getOwnerRuntimePersistMode>;
        mutable: boolean;
        hydrateFailed: boolean;
      };
    }
  | { error: string; status: number }
> {
  const persistMode = getOwnerRuntimePersistMode();
  if (persistMode === "blocked") {
    return { error: ownerRuntimeMutationBlockedMessage(), status: 503 };
  }

  const hydrated = await ensureMaintenanceHydrated();
  if (!hydrated) {
    return {
      error: "設定の読み込みに失敗したため、変更を保存できません。",
      status: 503,
    };
  }

  const previous = getMaintenanceModeConfig();
  setMaintenanceModeConfig(patch);

  if (persistMode === "durable") {
    const saved = await persistMaintenanceNow();
    if (!saved) {
      setMaintenanceModeConfig({
        enabled: previous.enabled,
        message: previous.message,
        announcement: previous.announcement,
        estimatedRecoveryAt: previous.estimatedRecoveryAt,
      });
      return {
        error: "保存に失敗したため、変更は反映していません。",
        status: 503,
      };
    }
  }

  return { config: await getMaintenanceModeConfigForOwner() };
}
