import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeWorkerScale } from "@/lib/work-queue/worker-scale-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P2-03: worker horizontal scale probe (public flags only).
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

  const result = await probeWorkerScale();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    minutePathPresent: result.minutePathPresent,
    claimLimitReviewed: result.claimLimitReviewed,
    horizontalDrainWired: result.horizontalDrainWired,
    backpressureConfigured: result.backpressureConfigured,
    multiWorkerLeaseOk: result.multiWorkerLeaseOk,
    horizontalDrainOk: result.horizontalDrainOk,
    memoryNotSot: result.memoryNotSot,
    multiInstanceSafe: result.multiInstanceSafe,
    failClosedUnauthorized: result.failClosedUnauthorized,
    fanOutDefault: result.fanOutDefault,
    claimBatch: result.claimBatch,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/worker-scale]", {
    ok: result.ok,
    multiWorkerLeaseOk: result.multiWorkerLeaseOk,
    horizontalDrainWired: result.horizontalDrainWired,
    backpressureConfigured: result.backpressureConfigured,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
