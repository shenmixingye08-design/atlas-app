import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeApiContracts } from "@/lib/api-contracts/production-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P2-01: Production API contract smoke (public, boolean flags + per-contract ok).
 * Live HTTP against this deployment — no memory-only success.
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

  const result = await probeApiContracts({ requestUrl: request.url });
  lastRunAtMs = Date.now();
  lastOk = result.ok;

  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    contractsDefined: result.contractsDefined,
    contractsChecked: result.contractsChecked,
    contractsPassed: result.contractsPassed,
    allCriticalCovered: result.allCriticalCovered,
    qualityGateWired: result.qualityGateWired,
    memoryNotSot: result.memoryNotSot,
    multiInstanceSafe: result.multiInstanceSafe,
    failClosed: result.failClosed,
    // Per-contract boolean summary only (no response bodies).
    results: result.results.map((r) => ({
      id: r.id,
      ok: r.ok,
      httpStatus: r.httpStatus,
      expectedStatus: r.expectedStatus,
      error: r.error,
    })),
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/api-contracts]", {
    ok: result.ok,
    contractsPassed: result.contractsPassed,
    contractsDefined: result.contractsDefined,
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
