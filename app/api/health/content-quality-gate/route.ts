import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeContentQualityGate } from "@/lib/deliverables/content-quality-gate-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P2-02: Unified non-Word content quality gate probe (public flags only).
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

  const result = probeContentQualityGate();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    commonGateOk: result.commonGateOk,
    nonWordFormatsGated: result.nonWordFormatsGated,
    formatSpecificOk: result.formatSpecificOk,
    engineNonWordPathGated: result.engineNonWordPathGated,
    failClosedOnGarbage: result.failClosedOnGarbage,
    memoryNotSot: result.memoryNotSot,
    multiInstanceSafe: result.multiInstanceSafe,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/content-quality-gate]", {
    ok: result.ok,
    commonGateOk: result.commonGateOk,
    nonWordFormatsGated: result.nonWordFormatsGated,
    formatSpecificOk: result.formatSpecificOk,
    engineNonWordPathGated: result.engineNonWordPathGated,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
