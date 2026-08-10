import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeMemoryApplyProduction } from "@/lib/memory-apply/memory-apply-production-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * N-05: Personal Memory Production apply probe (public flags only).
 * Proves DB SoT save/retrieve/apply for artifacts + automation without
 * returning Memory body or secrets.
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

  const result = await probeMemoryApplyProduction();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    dbSotOk: result.dbSotOk,
    saveRetrieveOk: result.saveRetrieveOk,
    memoryAppliedOk: result.memoryAppliedOk,
    artifactPreferenceAppliedOk: result.artifactPreferenceAppliedOk,
    automationPreferenceAppliedOk: result.automationPreferenceAppliedOk,
    restartDurableOk: result.restartDurableOk,
    multiInstanceOk: result.multiInstanceOk,
    ownershipIsolationOk: result.ownershipIsolationOk,
    crossUserMemoryLeak: result.crossUserMemoryLeak,
    deletePropagationOk: result.deletePropagationOk,
    updatePropagationOk: result.updatePropagationOk,
    secretsRedacted: result.secretsRedacted,
    failClosedOk: result.failClosedOk,
    memorySaved: result.memorySaved,
    memoryRetrieved: result.memoryRetrieved,
    memoryApplied: result.memoryApplied,
    failClosed: result.failClosed,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
    correlationId: result.correlationId,
  };
  lastSafeBody = body;

  console.info("[health/memory-apply]", {
    ok: result.ok,
    error: result.error,
    correlationId: result.correlationId,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export const __resetMemoryApplyHealthCacheForTests = () => {
  lastRunAtMs = 0;
  lastOk = false;
  lastSafeBody = null;
};
