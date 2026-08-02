import type { IntegrationAdapter } from "@/lib/integration-platform/adapter";
import { createSandboxAdapter } from "@/lib/integration-platform/sandbox-adapter";
import type { IntegrationServiceId } from "@/lib/integration-platform/types";
import { INTEGRATION_SERVICE_IDS } from "@/lib/integration-platform/types";

const adapters = new Map<IntegrationServiceId, IntegrationAdapter>();

export function isIntegrationSandboxMode(): boolean {
  return (
    process.env.INTEGRATION_SANDBOX === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true"
  );
}

export function registerAdapter(adapter: IntegrationAdapter): void {
  adapters.set(adapter.serviceId, adapter);
}

export function getAdapter(serviceId: IntegrationServiceId): IntegrationAdapter {
  const existing = adapters.get(serviceId);
  if (existing) return existing;
  // Default: sandbox wrapper so CI/tests always have a contract implementation.
  // Live adapters can be registered at boot when credentials exist.
  const sandbox = createSandboxAdapter(serviceId);
  adapters.set(serviceId, sandbox);
  return sandbox;
}

export function listRegisteredAdapters(): IntegrationServiceId[] {
  return [...INTEGRATION_SERVICE_IDS];
}

export function resetAdapterRegistryForTests(): void {
  adapters.clear();
}
