import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeBillingUsageIncrementRpc } from "@/lib/billing/usage/increment-rpc-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read-only by default: does not increment customer usage.
 * apply=1 (CRON / owner) creates/replaces the increment RPC and reloads PostgREST.
 */
let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeBillingUsageIncrementRpc>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    usageRpcReady: result.rpcReady && result.signatureMatches,
    usageCountersReady: result.countersReady,
    usageClaimsReady: result.claimsReady,
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

  const result = await probeBillingUsageIncrementRpc({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/billing-usage-rpc]", {
    ok: result.ok,
    rpcReady: result.rpcReady,
    signatureMatches: result.signatureMatches,
    countersReady: result.countersReady,
    claimsReady: result.claimsReady,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
    applyRequested: apply,
    errorCode: result.errorCode,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
