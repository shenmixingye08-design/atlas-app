import {
  ADAPTER_AUDIT_INVENTORY,
  buildAdapterHealth,
  getAdapterRegistry,
  isServiceConfigured,
  resolveAdapterRuntimeMode,
  validateProductionAdapterConfig,
} from "@/lib/live-adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live Adapter Health — mode, registry, config, per-service health. */
export async function GET(): Promise<Response> {
  const mode = resolveAdapterRuntimeMode();
  const registry = await getAdapterRegistry({ mode });
  const config = validateProductionAdapterConfig();
  const services = registry.list().map((adapter) =>
    buildAdapterHealth(adapter.service, {
      mode,
      registered: true,
      configured: isServiceConfigured(adapter.service),
      classification: adapter.classification,
      availability: adapter.availability,
    }),
  );

  const sandboxFlagsPresent = Boolean(
    process.env.USE_SANDBOX?.trim() ||
      process.env.INTEGRATION_MODE?.trim().toLowerCase() === "sandbox" ||
      process.env.ATLAS_ALLOW_SANDBOX_ADAPTERS?.trim(),
  );

  const ok =
    (mode !== "production" || !sandboxFlagsPresent) &&
    registry.list().every((a) =>
      mode === "production" ? a.mode === "production" : true,
    );

  return Response.json(
    {
      ok,
      runtimeMode: mode,
      registeredAdapters: registry.list().map((a) => ({
        id: a.id,
        service: a.service,
        mode: a.mode,
        classification: a.classification,
        availability: a.availability,
      })),
      config,
      services,
      inventory: ADAPTER_AUDIT_INVENTORY,
      sandboxForbiddenInProduction: mode !== "production" || !sandboxFlagsPresent,
      generatedAt: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
