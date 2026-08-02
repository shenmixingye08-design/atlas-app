import type {
  AdapterRegistry,
  AdapterRuntimeMode,
  AnyIntegrationAdapter,
  IntegrationService,
} from "../types";

export function createAdapterRegistry(
  mode: AdapterRuntimeMode,
  adapters: AnyIntegrationAdapter[],
): AdapterRegistry {
  const map = new Map<IntegrationService, AnyIntegrationAdapter>();
  for (const adapter of adapters) {
    if (mode === "production") {
      const id = adapter.id;
      const adapterMode = adapter.mode as string;
      const classification = adapter.classification as string;
      if (adapterMode !== "production") {
        throw new Error(
          `Production registry rejects non-production adapter: ${id} mode=${adapterMode}`,
        );
      }
      if (classification !== "production_live") {
        throw new Error(
          `Production registry rejects non-live adapter: ${id} classification=${classification}`,
        );
      }
    }
    map.set(adapter.service, adapter);
  }

  return {
    mode,
    adapters: map,
    get(service) {
      return map.get(service) ?? null;
    },
    require(service) {
      const found = map.get(service);
      if (!found) {
        throw new Error(`Adapter missing for service: ${service}`);
      }
      return found;
    },
    list() {
      return [...map.values()];
    },
  };
}
