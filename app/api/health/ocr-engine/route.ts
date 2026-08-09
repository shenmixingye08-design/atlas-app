import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeOcrEngine } from "@/lib/ocr-engine/ocr-engine-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P2-05: OCR dedicated-engine evaluation probe (public flags).
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 60_000;

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

  const result = await probeOcrEngine();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    evaluationComplete: result.evaluationComplete,
    visionOcrPathPresent: result.visionOcrPathPresent,
    accuracyGateOk: result.accuracyGateOk,
    dedicatedEngineRequired: result.dedicatedEngineRequired,
    dedicatedEnginePolicyOk: result.dedicatedEnginePolicyOk,
    restartDurableOk: result.restartDurableOk,
    retrySafe: result.retrySafe,
    multiInstanceSafe: result.multiInstanceSafe,
    memoryNotSot: result.memoryNotSot,
    ownershipIsolationOk: result.ownershipIsolationOk,
    secretsRedacted: result.secretsRedacted,
    tableOk: result.tableOk,
    failClosedOnMissingProvider: result.failClosedOnMissingProvider,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/ocr-engine]", {
    ok: result.ok,
    accuracyGateOk: result.accuracyGateOk,
    dedicatedEngineRequired: result.dedicatedEngineRequired,
    dedicatedEnginePolicyOk: result.dedicatedEnginePolicyOk,
    restartDurableOk: result.restartDurableOk,
    memoryNotSot: result.memoryNotSot,
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
