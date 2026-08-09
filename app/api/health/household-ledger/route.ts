import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeHouseholdLedgerSchema } from "@/lib/receipt/repository/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-05 Household ledger DB SoT readiness probe.
 * Read-only (default): public boolean flags only.
 * apply=1: CRON_SECRET / owner only.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeHouseholdLedgerSchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    ledgerTableOk: result.ledgerTableOk,
    dbSotReady: result.dbSotReady,
    legacyLimitRemoved: result.legacyLimitRemoved,
    memoryNotSot: result.memoryNotSot,
    ownershipOk: result.ownershipOk,
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

  const result = await probeHouseholdLedgerSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/household-ledger]", {
    ok: result.ok,
    ledgerTableOk: result.ledgerTableOk,
    dbSotReady: result.dbSotReady,
    legacyLimitRemoved: result.legacyLimitRemoved,
    memoryNotSot: result.memoryNotSot,
    ownershipOk: result.ownershipOk,
    applyRequested: apply,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
