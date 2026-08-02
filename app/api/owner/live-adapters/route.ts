import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  ADAPTER_AUDIT_INVENTORY,
  buildAdapterHealth,
  getAdapterRegistry,
  isServiceConfigured,
  listAdapterMetricSamples,
  resolveAdapterRuntimeMode,
  validateProductionAdapterConfig,
} from "@/lib/live-adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner Integration Dashboard data. */
export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const mode = resolveAdapterRuntimeMode();
  const registry = await getAdapterRegistry({ mode });
  const services = registry.list().map((adapter) =>
    buildAdapterHealth(adapter.service, {
      mode,
      registered: true,
      configured: isServiceConfigured(adapter.service),
      classification: adapter.classification,
      availability: adapter.availability,
    }),
  );

  return Response.json({
    runtimeMode: mode,
    config: validateProductionAdapterConfig(),
    services,
    recent: listAdapterMetricSamples(100),
    inventory: ADAPTER_AUDIT_INVENTORY,
    generatedAt: new Date().toISOString(),
  });
}
