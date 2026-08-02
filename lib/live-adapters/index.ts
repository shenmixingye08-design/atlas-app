export type {
  AdapterAvailability,
  AdapterClassification,
  AdapterExecuteInput,
  AdapterHealthSnapshot,
  AdapterRegistry,
  AdapterRuntimeMode,
  AnyIntegrationAdapter,
  AutomationPreflightResult,
  IntegrationService,
  LiveExecutionResult,
  LiveIntegrationAdapter,
  ProductionConfigCheck,
  ValidationResult,
} from "./types";

export {
  AdapterRuntimeModeError,
  assertProductionDisallowsSandbox,
  previewLiveExternalEnabled,
  resolveAdapterRuntimeMode,
} from "./mode";
export {
  validateProductionAdapterConfig,
  isServiceConfigured,
} from "./config";
export {
  buildIdempotencyKey,
  hashContent,
  getIdempotentResult,
  saveIdempotentResult,
  resetLiveAdapterIdempotencyForTests,
} from "./idempotency";
export {
  buildAdapterHealth,
  listAdapterMetricSamples,
  recordAdapterMetric,
  resetLiveAdapterMetricsForTests,
} from "./metrics";
export { buildExecutionResult, mapProviderError } from "./result";
export { ADAPTER_AUDIT_INVENTORY } from "./inventory";
export {
  mapCapabilityToIntegrationService,
  runAutomationLiveAdapterPreflight,
} from "./preflight";
export { invokeLiveAdapterForStep } from "./invoke";
export { createTestAdapterRegistry } from "./registry/test";
export {
  assertLiveSideEffectsAllowed,
  getAdapterRegistry,
  resetAdapterRegistryCacheForTests,
} from "./registry/resolve";

/** Lazy factories — do not eagerly import provider SDKs. */
export async function createProductionAdapterRegistry() {
  const mod = await import("./registry/production");
  return mod.createProductionAdapterRegistry();
}

export async function createPreviewAdapterRegistry() {
  const mod = await import("./registry/preview");
  return mod.createPreviewAdapterRegistry();
}
