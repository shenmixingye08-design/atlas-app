import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeN03PowerpointProductSurface } from "@/lib/deliverables/n03-powerpoint-product-surface-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * N-03: PowerPoint product surface Production probe (public flags only).
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const now = Date.now();
  if (!force && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastSafeBody,
        ...toPublicHealthResponse({ ok: lastOk }, { cached: true }),
      },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probeN03PowerpointProductSurface();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    powerpointCapabilityOk: result.powerpointCapabilityOk,
    powerpointRoutingOk: result.powerpointRoutingOk,
    pptxGenerationOk: result.pptxGenerationOk,
    pptxMimeOk: result.pptxMimeOk,
    pptxDownloadOk: result.pptxDownloadOk,
    artifactPersistenceOk: result.artifactPersistenceOk,
    mobileExposureOk: result.mobileExposureOk,
    failClosedOk: result.failClosedOk,
    crossUserIsolatedOk: result.crossUserIsolatedOk,
    secretsRedactedOk: result.secretsRedactedOk,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
    correlationId: result.correlationId,
  };
  lastSafeBody = body;

  console.info("[health/n03-powerpoint-product-surface]", {
    ok: result.ok,
    error: result.error,
    correlationId: result.correlationId,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
