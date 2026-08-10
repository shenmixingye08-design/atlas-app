import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probePlanCapabilityHonesty } from "@/lib/billing/plans/plan-capability-honesty-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * N-01: Plan / capability honesty probe.
 * Ensures Production does not advertise unoffered media generation.
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

  const result = probePlanCapabilityHonesty();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    planCatalogHonest: result.planCatalogHonest,
    premiumMediaLimitsOff: result.premiumMediaLimitsOff,
    mediaFlagsDefaultOff: result.mediaFlagsDefaultOff,
    quickPresetsHonest: result.quickPresetsHonest,
    landingExamplesHonest: result.landingExamplesHonest,
    workflowLabelsHonest: result.workflowLabelsHonest,
    openaiImagesComingSoon: result.openaiImagesComingSoon,
    visionNotGatedOnImageGen: result.visionNotGatedOnImageGen,
    offeredPremiumFeaturesPresent: result.offeredPremiumFeaturesPresent,
    memoryNotSot: result.memoryNotSot,
    failClosed: result.failClosed,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/plan-capability]", {
    ok: result.ok,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export const __resetPlanCapabilityHealthCacheForTests = () => {
  lastRunAtMs = 0;
  lastOk = false;
  lastSafeBody = null;
};
