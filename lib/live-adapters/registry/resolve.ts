import "server-only";

import {
  assertProductionDisallowsSandbox,
  previewLiveExternalEnabled,
  resolveAdapterRuntimeMode,
} from "../mode";
import type { AdapterRegistry, AdapterRuntimeMode } from "../types";
import { createTestAdapterRegistry } from "./test";

let cached: { mode: AdapterRuntimeMode; registry: AdapterRegistry } | null =
  null;

export async function getAdapterRegistry(options?: {
  mode?: AdapterRuntimeMode;
  forceReload?: boolean;
}): Promise<AdapterRegistry> {
  const mode = options?.mode ?? resolveAdapterRuntimeMode();
  if (!options?.forceReload && cached && cached.mode === mode) {
    return cached.registry;
  }

  let registry: AdapterRegistry;
  switch (mode) {
    case "production": {
      assertProductionDisallowsSandbox(mode);
      const mod = await import("./production");
      registry = mod.createProductionAdapterRegistry();
      break;
    }
    case "preview": {
      const mod = await import("./preview");
      registry = mod.createPreviewAdapterRegistry();
      break;
    }
    case "test":
      registry = createTestAdapterRegistry();
      break;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unsupported adapter runtime mode: ${_exhaustive}`);
    }
  }

  if (mode === "production") {
    for (const adapter of registry.list()) {
      if (
        adapter.mode !== "production" ||
        adapter.classification !== "production_live"
      ) {
        throw new Error(
          `Production registry contamination detected: ${adapter.id}`,
        );
      }
    }
  }

  cached = { mode, registry };
  return registry;
}

export function resetAdapterRegistryCacheForTests(): void {
  cached = null;
}

export function assertLiveSideEffectsAllowed(mode: AdapterRuntimeMode): {
  allowed: boolean;
  reason: string | null;
} {
  if (mode === "production") return { allowed: true, reason: null };
  if (mode === "test") return { allowed: true, reason: null };
  if (previewLiveExternalEnabled()) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason:
      "Preview では ATLAS_PREVIEW_LIVE_EXTERNAL=true（または AUTOMATION_E2E_LIVE_EXTERNAL=true）が必要です。偽成功は禁止です。",
  };
}
