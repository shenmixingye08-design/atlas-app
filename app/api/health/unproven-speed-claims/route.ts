import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeUnprovenSpeedClaims } from "@/lib/marketing/unproven-speed-claims-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * N-02: Unproven speed-claim honesty probe.
 * Ensures LP / pricing / metadata / post-login copy do not guarantee
 * unmeasured job-completion SLAs (e.g. 60秒で1件完成).
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

  const result = probeUnprovenSpeedClaims();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    metadataHonest: result.metadataHonest,
    onboardingCopyHonest: result.onboardingCopyHonest,
    landingSurfacesHonest: result.landingSurfacesHonest,
    pricingHonest: result.pricingHonest,
    postLoginUiHonest: result.postLoginUiHonest,
    identifierHonest: result.identifierHonest,
    failClosed: result.failClosed,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/unproven-speed-claims]", {
    ok: result.ok,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export const __resetUnprovenSpeedClaimsHealthCacheForTests = () => {
  lastRunAtMs = 0;
  lastOk = false;
  lastSafeBody = null;
};
