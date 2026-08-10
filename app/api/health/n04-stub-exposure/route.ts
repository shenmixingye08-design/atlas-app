import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeN04StubExposureProduction } from "@/lib/integrations/n04-stub-exposure-production-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * N-04: Notion / YouTube stub exposure Production probe (public flags only).
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

  const result = await probeN04StubExposureProduction();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    canonicalCapabilityOk: result.canonicalCapabilityOk,
    notionCapabilityTruthfulOk: result.notionCapabilityTruthfulOk,
    youtubeCapabilityTruthfulOk: result.youtubeCapabilityTruthfulOk,
    notionUiExposureOk: result.notionUiExposureOk,
    youtubeUiExposureOk: result.youtubeUiExposureOk,
    notionAutomationExposureOk: result.notionAutomationExposureOk,
    youtubeAutomationExposureOk: result.youtubeAutomationExposureOk,
    pricingExposureOk: result.pricingExposureOk,
    landingExposureOk: result.landingExposureOk,
    onboardingExposureOk: result.onboardingExposureOk,
    unsupportedApiFailClosedOk: result.unsupportedApiFailClosedOk,
    stubCannotReturnSuccessOk: result.stubCannotReturnSuccessOk,
    existingAutomationSafeOk: result.existingAutomationSafeOk,
    crossUserIsolatedOk: result.crossUserIsolatedOk,
    secretsRedactedOk: result.secretsRedactedOk,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
    correlationId: result.correlationId,
  };
  lastSafeBody = body;

  console.info("[health/n04-stub-exposure]", {
    ok: result.ok,
    error: result.error,
    correlationId: result.correlationId,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
