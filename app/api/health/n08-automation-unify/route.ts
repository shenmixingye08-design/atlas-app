import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeN08AutomationUnifyProduction } from "@/lib/automations/canonical/n08-automation-unify-production-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * N-08: Automation canonical unify Production probe (public flags only).
 *
 * Frequency: there is no Vercel Cron for this route. The ~30s interval seen
 * in Production is this in-process cache plus external monitors / GitHub
 * verify workflows calling `?force=1`. Concurrent calls share one in-flight
 * probe so slot cleanup cannot overlap.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
let inFlight: Promise<Response> | null = null;
const MIN_INTERVAL_MS = 60_000;

function toResponse(
  result: Awaited<ReturnType<typeof probeN08AutomationUnifyProduction>>,
  cached: boolean,
): Response {
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached }),
    canonicalModelOk: result.canonicalModelOk,
    legacyReadOk: result.legacyReadOk,
    legacyExecuteOk: result.legacyExecuteOk,
    newExecuteOk: result.newExecuteOk,
    createUnifiedOk: result.createUnifiedOk,
    editUnifiedOk: result.editUnifiedOk,
    pauseResumeUnifiedOk: result.pauseResumeUnifiedOk,
    deleteSemanticsOk: result.deleteSemanticsOk,
    memoryV1Ok: result.memoryV1Ok,
    memoryV2Ok: result.memoryV2Ok,
    schedulerCompatibleOk: result.schedulerCompatibleOk,
    workerCompatibleOk: result.workerCompatibleOk,
    retrySafeOk: result.retrySafeOk,
    idempotencyOk: result.idempotencyOk,
    multiInstanceOk: result.multiInstanceOk,
    crossUserIsolatedOk: result.crossUserIsolatedOk,
    userFacingV1V2HiddenOk: result.userFacingV1V2HiddenOk,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
    correlationId: result.correlationId,
  };
  lastSafeBody = body;
  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

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

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const result = await probeN08AutomationUnifyProduction();
    lastRunAtMs = Date.now();
    console.info("[health/n08-automation-unify]", {
      ok: result.ok,
      error: result.error,
      correlationId: result.correlationId,
    });
    return toResponse(result, false);
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export const __resetN08AutomationUnifyHealthCacheForTests = () => {
  lastRunAtMs = 0;
  lastOk = false;
  lastSafeBody = null;
  inFlight = null;
};
