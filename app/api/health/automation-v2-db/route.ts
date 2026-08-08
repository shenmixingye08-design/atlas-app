import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeAutomationV2DbSotSchema } from "@/lib/automation-platform/repository/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-03 Automation V2 DB SoT readiness probe.
 * Read-only (default): public boolean flags only.
 * apply=1: CRON_SECRET / owner only.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeAutomationV2DbSotSchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    automationsTableOk: result.automationsTableOk,
    runsTableOk: result.runsTableOk,
    runsPayloadColumnOk: result.runsPayloadColumnOk,
    dbSotReady: result.dbSotReady,
    memoryNotSot: result.memoryNotSot,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";

  if (apply) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
  }

  const now = Date.now();
  if (!force && !apply && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
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

  const result = await probeAutomationV2DbSotSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/automation-v2-db]", {
    ok: result.ok,
    automationsTableOk: result.automationsTableOk,
    runsTableOk: result.runsTableOk,
    runsPayloadColumnOk: result.runsPayloadColumnOk,
    applyRequested: apply,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
